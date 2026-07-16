// FAQ cache + question telemetry. Every chat the operator sends is
// logged to `chat_logs`; similar questions get clustered into FAQ
// entries over time; once a FAQ hits count ≥ 3 with the same answer
// pattern, the next matching question is served from cache (skip the
// slow LLM round-trip).
//
// The flow per chat:
//   1. log the question (chat_logs)  ← always, even if Ollama is down
//   2. embed question, cosine against FAQ centroids → if score ≥ 0.92
//      AND the FAQ is approved, return its response_template as-is and
//      mark served_from='faq'.
//   3. otherwise the caller runs the LLM path, then records the final
//      outcome (served_from, latency, knowledge hit titles).
//
// Daily clustering job (`scripts/faq-extract.mjs`):
//   take the last 7 days of chat_logs, embed each unanswered question,
//   cluster by cosine ≥ 0.85, and emit FAQ drafts for the operator to
//   approve via /api/chat/faq/:id/approve.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { log } from './util.js'

const FAQ_HIT_THRESHOLD = 0.92  // very high — false positives here are user-facing

// A plain SHA-256(ip) is not real anonymization: IPv4 space is only ~4.3B
// addresses, so a rainbow table over the whole address space is a cheap
// precompute for anyone who gets the DB — trivially reversible. Salt with a
// per-install secret (generated once, kept in the DB's own kv table) so the
// hash can't be reversed without that secret.
function getIpSalt(db) {
  let salt = db.kvGet('ip_hash_salt')
  if (!salt) {
    salt = randomBytes(32).toString('hex')
    db.kvSet('ip_hash_salt', salt)
  }
  return salt
}

// The FAQ admin surface can rewrite what the chatbot tells users (approve/
// edit response_template) and read every question ever asked — now that the
// dashboard is public, this needs a gate. No user accounts in this codebase,
// so: one shared secret, generated once and kept in the DB, required via
// the X-Admin-Token header. Logged once at boot (only when first generated)
// so the operator can retrieve it from the launchd log.
function getAdminToken(db) {
  let token = db.kvGet('admin_token')
  if (!token) {
    token = randomBytes(24).toString('hex')
    db.kvSet('admin_token', token)
    log('info', 'generated admin token for FAQ/chat-log admin routes — save this, it will not be printed again', { admin_token: token })
  }
  return token
}

function timingSafeStrEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''))
  const bufB = Buffer.from(String(b ?? ''))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function ipHash(req, salt) {
  const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
        || req?.socket?.remoteAddress
        || 'unknown'
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 16)
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

function vecToBytes(v) { return Buffer.from(new Float32Array(v).buffer) }
function bytesToVec(b) {
  if (!b) return null
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}

export function createFaq({ db, rag }) {
  const ipSalt = getIpSalt(db)
  const adminToken = getAdminToken(db)

  function isAdmin(req) {
    return timingSafeStrEqual(req?.headers?.['x-admin-token'], adminToken)
  }

  // ── Logging ─────────────────────────────────────────────────────────
  function logQuestion({ req, lang, message }) {
    try {
      const res = db.run(
        `INSERT INTO chat_logs (ts, ip_hash, lang, message) VALUES (?,?,?,?)`,
        new Date().toISOString(), ipHash(req, ipSalt), lang || 'en', message.slice(0, 1000))
      return Number(res.lastInsertRowid)
    } catch (err) {
      log('error', 'chat log insert failed', { error: String(err) })
      return null
    }
  }

  // `logId` ties this update to the exact row logQuestion() created — matching
  // by message text instead would let two users asking the same common
  // question in quick succession clobber each other's outcome (served_from,
  // latency, knowledge hits), which is exactly the traffic pattern FAQ-worthy
  // questions produce. Falls back to the old text-match only if no id is
  // available (shouldn't happen in practice, but keeps this from throwing).
  function recordOutcome({ logId = null, message, servedFrom, faqId = null, faqScore = null,
                          factsLen = 0, knowledgeTitles = [], latencyMs = 0,
                          responseLen = 0 }) {
    try {
      if (logId != null) {
        db.run(
          `UPDATE chat_logs
              SET served_from = ?, faq_id = ?, faq_score = ?,
                  facts_len = ?, knowledge_titles = ?, latency_ms = ?, response_len = ?
            WHERE id = ?`,
          servedFrom, faqId, faqScore,
          factsLen, JSON.stringify(knowledgeTitles || []),
          Math.round(latencyMs || 0), responseLen || 0,
          logId)
        return
      }
      db.run(
        `UPDATE chat_logs
            SET served_from = ?, faq_id = ?, faq_score = ?,
                facts_len = ?, knowledge_titles = ?, latency_ms = ?, response_len = ?
          WHERE id = (SELECT id FROM chat_logs
                       WHERE message = ? AND served_from IS NULL
                       ORDER BY id DESC LIMIT 1)`,
        servedFrom, faqId, faqScore,
        factsLen, JSON.stringify(knowledgeTitles || []),
        Math.round(latencyMs || 0), responseLen || 0,
        message.slice(0, 1000))
    } catch (err) {
      log('error', 'chat outcome update failed', { error: String(err) })
    }
  }

  function recordFeedback(id, value) {
    db.run('UPDATE chat_logs SET feedback = ? WHERE id = ?', value, id)
  }

  // ── FAQ cache lookup ───────────────────────────────────────────────
  async function tryFaqHit(question, lang) {
    if (!rag) return null
    try {
      const [qv] = await rag.embed([`search_query: ${question}`])
      const rows = db.all(
        `SELECT id, pattern_th, pattern_en, response_template, centroid, served_count
           FROM chat_faq
          WHERE lang = ? AND approved = 1`, lang || 'en')
      let best = null
      for (const r of rows) {
        const v = bytesToVec(r.centroid)
        if (!v) continue
        const score = cosine(qv, v)
        if (!best || score > best.score) {
          best = { id: r.id, score, pattern_th: r.pattern_th, pattern_en: r.pattern_en,
                   response_template: r.response_template }
        }
      }
      if (best && best.score >= FAQ_HIT_THRESHOLD) {
        db.run('UPDATE chat_faq SET served_count = served_count + 1 WHERE id = ?', best.id)
        return best
      }
      return null
    } catch (err) {
      log('warn', 'faq lookup failed; falling through to LLM', { error: String(err) })
      return null
    }
  }

  // ── Daily clustering: build a FAQ candidate from recent logs ───────
  // (Called by scripts/faq-extract.mjs as a one-shot — exposed here so
  // the logic lives next to the rest of the FAQ code.)
  async function clusterRecent({ days = 7, similarity = 0.85, minClusterSize = 3 } = {}) {
    const status = await rag?.probe?.()
    if (!status?.reachable || !status?.hasEmbed) {
      return { ok: false, reason: 'embedding API not configured' }
    }
    const rows = db.all(
      `SELECT id, lang, message
         FROM chat_logs
        WHERE ts >= datetime('now', ?)
          AND served_from = 'llm'
          AND length(message) >= 10
        ORDER BY id DESC LIMIT 1000`, `-${days} days`)
    if (rows.length < minClusterSize) return { ok: true, candidates: 0 }

    // Embed each question
    const embeddings = []
    for (const r of rows) {
      try {
        const [v] = await rag.embed([`search_query: ${r.message}`])
        embeddings.push({ id: r.id, lang: r.lang, message: r.message, vec: v })
      } catch (err) {
        log('warn', 'embed failed for chat log', { id: r.id, error: String(err) })
      }
    }
    if (embeddings.length < minClusterSize) return { ok: true, candidates: 0 }

    // Greedy clustering: for each row, find an existing FAQ centroid
    // close enough to claim; otherwise start a new cluster.
    const existing = db.all(
      `SELECT id, lang, pattern_th, pattern_en, centroid, approved FROM chat_faq`)
    const clusters = existing.map((e) => ({
      ...e, members: [], centroid: bytesToVec(e.centroid),
    }))

    for (const item of embeddings) {
      const sameLang = clusters.filter((c) => c.lang === item.lang)
      let placed = false
      for (const c of sameLang) {
        if (!c.centroid) continue
        const score = cosine(item.vec, c.centroid)
        if (score >= similarity) {
          c.members.push(item)
          // Drift the centroid (running mean).
          for (let i = 0; i < c.centroid.length; i++) {
            c.centroid[i] = (c.centroid[i] * (c.members.length - 1) + item.vec[i]) / c.members.length
          }
          placed = true
          break
        }
      }
      if (!placed) {
        clusters.push({
          id: null, lang: item.lang, members: [item],
          centroid: Float32Array.from(item.vec),
          approved: 0,
        })
      }
    }

    // Persist: brand-new clusters need >= minClusterSize to become a draft,
    // but an EXISTING (already-created) FAQ already cleared that bar once —
    // even a single new matching question this run should still update its
    // centroid/count, or small trickles of matches never accumulate (they'd
    // need minClusterSize NEW hits in one run, forever, instead of drifting).
    const candidates = []
    for (const c of clusters) {
      if (c.members.length === 0) continue
      if (!c.id && c.members.length < minClusterSize) continue
      // Generate a canonical pattern (shortest member is usually the cleanest)
      const example = c.members.map((m) => m.message)
        .sort((a, b) => a.length - b.length)[0]
      // Build response_template from the last successful chat log entry's
      // response_len + the snapshot the operator saw. The actual model
      // response isn't persisted (would be too heavy) — the operator
      // approves via the UI and re-saves with a hand-written answer.
      const patternKey = clusterKey(c.centroid)
      const existingRow = c.id ? db.get('SELECT id, count, response_template, approved FROM chat_faq WHERE id = ?', c.id) : null
      const newCount = (existingRow?.count ?? 0) + c.members.length
      if (existingRow) {
        // Update centroid + count for an existing FAQ
        db.run(
          `UPDATE chat_faq SET centroid = ?, count = ?, updated_at = ?, example_msg = ?
             WHERE id = ?`,
          vecToBytes(c.centroid), newCount, new Date().toISOString(), example, c.id)
      } else {
        db.run(
          `INSERT INTO chat_faq (cluster_key, pattern, pattern_th, pattern_en, lang,
                                 count, example_msg, response_template, centroid,
                                 approved, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          patternKey, example, c.lang === 'th' ? example : null, c.lang === 'en' ? example : null,
          c.lang, newCount, example,
          '(รอเจ้าหน้าที่อนุมัติคำตอบ / operator-approved answer pending)',
          vecToBytes(c.centroid), 0, new Date().toISOString(), new Date().toISOString())
        candidates.push(patternKey)
      }
    }
    log('info', 'faq cluster pass complete', { candidates: candidates.length })
    return { ok: true, candidates: candidates.length }
  }

  function clusterKey(centroid) {
    // Stable hash of the centroid so duplicate clusters coalesce.
    const buf = Buffer.from(centroid.buffer, centroid.byteOffset, centroid.byteLength)
    return createHash('sha256').update(buf).digest('hex').slice(0, 16)
  }

  // ── Admin: list / approve / reject FAQ drafts ─────────────────────
  function listFaqs({ lang = null, onlyApproved = false, limit = 50 } = {}) {
    const where = []
    const params = []
    if (lang) { where.push('lang = ?'); params.push(lang) }
    if (onlyApproved) where.push('approved = 1')
    const sql = `SELECT id, pattern, pattern_th, pattern_en, lang, count,
                       example_msg, response_template, served_count, approved,
                       created_at, updated_at
                  FROM chat_faq
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY approved ASC, count DESC, served_count DESC
                 LIMIT ?`
    return db.all(sql, ...params, limit)
  }

  function approve(id, responseTemplate) {
    db.run(
      `UPDATE chat_faq SET approved = 1, response_template = ?, updated_at = ?
         WHERE id = ?`,
      responseTemplate, new Date().toISOString(), id)
    return db.get('SELECT * FROM chat_faq WHERE id = ?', id)
  }

  function reject(id) {
    db.run('DELETE FROM chat_faq WHERE id = ?', id)
  }

  function setResponse(id, responseTemplate) {
    db.run(
      `UPDATE chat_faq SET response_template = ?, updated_at = ? WHERE id = ?`,
      responseTemplate, new Date().toISOString(), id)
  }

  // ── Question log access for the operator dashboard ────────────────
  function recentLogs({ limit = 50, servedFrom = null } = {}) {
    if (servedFrom) {
      return db.all(
        `SELECT id, ts, lang, message, served_from, faq_id, faq_score,
                latency_ms, response_len, knowledge_titles, feedback
           FROM chat_logs
          WHERE served_from = ?
          ORDER BY id DESC LIMIT ?`,
        servedFrom, limit)
    }
    return db.all(
      `SELECT id, ts, lang, message, served_from, faq_id, faq_score,
              latency_ms, response_len, knowledge_titles, feedback
         FROM chat_logs
        ORDER BY id DESC LIMIT ?`,
      limit)
  }

  return {
    logQuestion, recordOutcome, recordFeedback,
    tryFaqHit, clusterRecent,
    listFaqs, approve, reject, setResponse,
    recentLogs,
    isAdmin,
    FAQ_HIT_THRESHOLD,
  }
}