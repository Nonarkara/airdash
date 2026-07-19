// LINE OA inbound — citizen-submitted photos and locations of haze / smoke /
// open-burning sightings. The PM2.5 sensor network is blind everywhere
// there's no gauge, and GISTDA's satellite product has a 3-6h revisit at
// best — a resident standing in the smoke is ground truth the pipelines
// can never give us. This module is the other half of server/line.js (which
// only pushes OUT); this one receives what citizens send IN.
//
// Flow: a user sends a photo and/or shares their location to the AirDash
// OA (either can come first, or alone). We merge a photo + location from
// the SAME user arriving within REPORT_MERGE_WINDOW_MS into ONE report
// row, then hold it as 'pending' until an operator approves or rejects it
// via the admin endpoints (server/api.js). Only 'approved' reports are
// ever public — an unmoderated report reaching the map is a worse failure
// than a slow one.
//
// Setup: this module reads the SAME kv keys server/line.js already writes
// (line_channel_secret, line_channel_token) — no separate config needed.
// The webhook endpoint URL itself is registered with LINE via
// `PUT /v2/bot/channel/webhook/endpoint` (done once, out of band), pointing
// at POST /api/line/webhook.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'
import { allow } from './ratelimit.js'

export const REPORTS_DIR = join(CONFIG.root, 'data/reports')

const REPORT_MERGE_WINDOW_MS = 15 * 60_000     // photo + location from the same user this close together = one report
const MAX_IMAGE_BYTES = 10 * 1024 * 1024        // LINE's own platform cap is similar; defend the disk regardless
const REPORTS_PER_HOUR_PER_USER = 10            // generous for a real reporter, blocks a scripted flood
const REJECTED_RETENTION_DAYS = 7               // rejected reports serve no purpose after review
const TOTAL_DIR_CAP_BYTES = 1024 * 1024 * 1024  // 1GB safety net — prune oldest images if ever exceeded
const TOTAL_DIR_TARGET_BYTES = 800 * 1024 * 1024 // ...down to this, so pruning doesn't thrash every cycle

// ── Province lookup (nearest centroid) — same source file every other
// per-province module reads (public/geo/provinces.json), loaded once. ──────
let _provinces = null
function loadProvinces() {
  if (_provinces) return _provinces
  const raw = JSON.parse(readFileSync(join(CONFIG.root, 'public/geo/provinces.json'), 'utf8'))
  _provinces = raw.map((p) => ({
    code: String(p.provinceCode), name_th: p.provinceNameTh, name_en: p.provinceNameEn,
    lat: p.lat, lng: p.lng,
  }))
  return _provinces
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
function nearestProvince(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best = null, bestKm = Infinity
  for (const p of loadProvinces()) {
    const km = haversineKm(lat, lng, p.lat, p.lng)
    if (km < bestKm) { bestKm = km; best = p }
  }
  return best
}

// ── Privacy: never store the raw LINE user ID. Same salted-hash pattern as
// chat_logs.ip_hash (server/faq.js) — a per-install salt kept in kv, so the
// hash can't be reversed even if the DB leaks. ─────────────────────────────
function getLineSalt(db) {
  let salt = db.kvGet('line_id_salt')
  if (!salt) { salt = randomBytes(32).toString('hex'); db.kvSet('line_id_salt', salt) }
  return salt
}
function hashLineUserId(db, userId) {
  return createHash('sha256').update(getLineSalt(db) + userId).digest('hex').slice(0, 16)
}

function timingSafeStrEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''))
  const bufB = Buffer.from(String(b ?? ''))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// HMAC signature verification — LINE signs every webhook body with the
// channel secret; a mismatched body is either a misconfiguration or a
// spoofed request, and we must reject both. 401 stops the spoof, and
// returning a 200 (instead of an error) on a bad signature avoids LINE
// retrying the delivery until they back off.
function verifySignature(rawBody, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64')
  return timingSafeStrEqual(signatureHeader, expected)
}

// Per-user rate limit — keyed on a per-install salt so we can count
// without ever persisting the raw LINE user ID. The counter is in
// memory (good enough; resets on restart) and is intentionally
// generous — a citizen might send 5 photos + 1 location to make a
// good haze report during an episode.
const _reportCounters = new Map()
function allowReport(userHash) {
  const now = Date.now()
  const arr = _reportCounters.get(userHash) ?? []
  const fresh = arr.filter((t) => now - t < 60 * 60_000)
  if (fresh.length >= REPORTS_PER_HOUR_PER_USER) {
    _reportCounters.set(userHash, fresh)
    return false
  }
  fresh.push(now)
  _reportCounters.set(userHash, fresh)
  return true
}

// Image plumbing — LINE delivers the photo bytes as a content provider
// message with an HTTPS URL. We download to disk so an admin can review
// the file later (rejection cases: the URL is short-lived).
async function downloadImage(messageId, accessToken) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`LINE content ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large')
  mkdirSync(REPORTS_DIR, { recursive: true })
  const fname = `${Date.now()}-${messageId}.jpg`
  const fpath = join(REPORTS_DIR, fname)
  writeFileSync(fpath, buf)
  return { path: fpath, bytes: buf.length }
}

// Disk cap — never let the report dir grow unbounded if something runs hot.
function pruneReports() {
  if (!existsSync(REPORTS_DIR)) return
  let total = 0
  const files = readdirSync(REPORTS_DIR).map((n) => {
    const p = join(REPORTS_DIR, n)
    const s = statSync(p)
    return { p, mtime: s.mtimeMs, size: s.size }
  })
  for (const f of files) total += f.size
  if (total <= TOTAL_DIR_CAP_BYTES) return
  files.sort((a, b) => a.mtime - b.mtime) // oldest first
  for (const f of files) {
    if (total <= TOTAL_DIR_TARGET_BYTES) break
    try { unlinkSync(f.p); total -= f.size } catch {}
  }
}

// Pending-report storage — kept in SQLite. Merged photo+location rows
// sit here until an operator acts. On approval, the same row is read
// by the public /api/reports endpoint (read-only).
function ensureReportsTable(db) {
  // CREATE TABLE IF NOT EXISTS at module load — cheaper than checking
  // every webhook call. Safe to re-run.
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_reports (
      id INTEGER PRIMARY KEY,
      user_hash TEXT NOT NULL,
      kind TEXT NOT NULL,             -- 'haze' | 'smoke' | 'burning' | 'other'
      message TEXT,
      image_path TEXT,
      lat REAL, lng REAL,
      province_code TEXT,
      province_th TEXT,
      province_en TEXT,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      review_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_line_reports_status ON line_reports(status, created_at DESC);
  `)
}

// Idempotent merge: if the same user posted a photo in the last
// REPORT_MERGE_WINDOW_MS, add this location to it instead of starting a
// new report. Symmetric for the photo-arrives-second case.
function findMergeable(db, userHash, now) {
  return db.get(
    `SELECT id, image_path, lat, lng FROM line_reports
     WHERE user_hash = ? AND status = 'pending'
       AND (created_at IS NULL OR (strftime('%s','now') - strftime('%s', created_at)) * 1000 < ?)
     ORDER BY id DESC LIMIT 1`,
    userHash, REPORT_MERGE_WINDOW_MS,
  )
}

function insertReport(db, row) {
  return db.run(
    `INSERT INTO line_reports
      (user_hash, kind, message, image_path, lat, lng, province_code, province_th, province_en, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    row.user_hash, row.kind ?? 'other', row.message ?? null, row.image_path ?? null,
    row.lat ?? null, row.lng ?? null, row.province_code ?? null, row.province_th ?? null, row.province_en ?? null,
    new Date().toISOString(),
  )
}

function updateReport(db, id, patch) {
  const fields = []
  const values = []
  for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v) }
  if (!fields.length) return
  values.push(id)
  db.run(`UPDATE line_reports SET ${fields.join(', ')} WHERE id = ?`, ...values)
}

// Hot path — every LINE webhook event lands here. We MUST return 200 fast
// (LINE has a 1s timeout; retries duplicate otherwise) and do the heavy
// work (image download, province lookup) in a non-blocking chain so the
// 200 goes out immediately.
export async function processLineWebhook(db, rawBody, signatureHeader) {
  ensureReportsTable(db)
  const secret = db.kvGet('line_channel_secret')
  if (secret && !verifySignature(rawBody, signatureHeader, secret)) {
    log('warn', 'LINE webhook signature mismatch — dropping')
    return { ok: false, status: 401 }
  }
  let parsed
  try { parsed = JSON.parse(rawBody) } catch {
    return { ok: false, status: 400, reason: 'invalid JSON' }
  }
  const events = parsed?.events ?? []
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: true, status: 200, processed: 0 }
  }
  const token = db.kvGet('line_channel_token')

  // Fire-and-forget per event — the HTTP 200 has to leave before the
  // image download finishes, otherwise LINE gives up and we get a
  // duplicate delivery (and a confusing log trail).
  for (const ev of events) {
    queueMicrotask(() => handleEvent(db, ev, token).catch((err) =>
      log('warn', 'LINE webhook event failed', { type: ev?.type, error: String(err?.message ?? err) }),
    ))
  }
  return { ok: true, status: 200, processed: events.length }
}

async function handleEvent(db, ev, accessToken) {
  if (ev.type !== 'message') return
  const userHash = hashLineUserId(db, ev.source?.userId ?? ev.source?.groupId ?? 'anon')
  if (!allowReport(userHash)) {
    log('warn', 'LINE report rate-limited', { user_hash: userHash })
    return
  }
  const msg = ev.message ?? {}
  const ts = ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString()

  if (msg.type === 'image' && accessToken) {
    let imagePath = null
    try {
      const { path } = await downloadImage(msg.id, accessToken)
      imagePath = path
      pruneReports()
    } catch (err) {
      log('warn', 'LINE image download failed', { error: String(err?.message ?? err) })
    }
    const merge = findMergeable(db, userHash, Date.now())
    if (merge?.id) {
      updateReport(db, merge.id, { image_path: imagePath ?? merge.image_path })
      return
    }
    insertReport(db, { user_hash: userHash, kind: 'haze', image_path: imagePath })
    return
  }

  if (msg.type === 'location') {
    const lat = Number(msg.latitude), lng = Number(msg.longitude)
    const prov = nearestProvince(lat, lng)
    const merge = findMergeable(db, userHash, Date.now())
    if (merge?.id) {
      updateReport(db, merge.id, {
        lat, lng,
        province_code: prov?.code ?? null, province_th: prov?.name_th ?? null, province_en: prov?.name_en ?? null,
      })
      return
    }
    insertReport(db, {
      user_hash: userHash, kind: 'haze',
      lat, lng,
      province_code: prov?.code ?? null, province_th: prov?.name_th ?? null, province_en: prov?.name_en ?? null,
    })
    return
  }

  if (msg.type === 'text') {
    const text = (msg.text ?? '').slice(0, 500)
    if (!text.trim()) return
    const merge = findMergeable(db, userHash, Date.now())
    if (merge?.id) {
      updateReport(db, merge.id, { message: text })
      return
    }
    insertReport(db, { user_hash: userHash, kind: 'haze', message: text })
    return
  }
}

// Admin / moderation endpoints — surfaced via /api/admin/line-reports/* in
// server/api.js. Read returns pending reports (paginated); approve/reject
// flips status and records a note.
export function listReports(db, { status = 'pending', limit = 50, offset = 0 } = {}) {
  return db.all(
    `SELECT id, kind, message, image_path, lat, lng, province_code, province_th, province_en, status, created_at, reviewed_at, review_note
     FROM line_reports
     WHERE status = ?
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    status, limit, offset,
  )
}

export function decideReport(db, id, { status, note = null } = {}) {
  if (status !== 'approved' && status !== 'rejected') {
    throw new Error('status must be approved or rejected')
  }
  const now = new Date().toISOString()
  updateReport(db, id, { status, reviewed_at: now, review_note: note })
  // Rejected reports are auto-deleted after REJECTED_RETENTION_DAYS so the
  // table doesn't grow without bound from a stream of misclassifications.
  // We do NOT delete them now — the operator might want to revisit.
  return db.get(`SELECT id, status, reviewed_at, review_note FROM line_reports WHERE id = ?`, id)
}

export function purgeRejected(db) {
  const cutoff = new Date(Date.now() - REJECTED_RETENTION_DAYS * 24 * 3600_000).toISOString()
  const rows = db.all(`SELECT id, image_path FROM line_reports WHERE status = 'rejected' AND reviewed_at < ?`, cutoff)
  for (const r of rows) {
    if (r.image_path) try { unlinkSync(r.image_path) } catch {}
  }
  db.run(`DELETE FROM line_reports WHERE status = 'rejected' AND reviewed_at < ?`, cutoff)
  return { purged: rows.length }
}
