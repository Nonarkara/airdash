// LLM chat over live data, via NVIDIA NIM's OpenAI-compatible API (free
// tier). The LLM never invents numbers: every figure is injected from SQLite
// into a FACTS block; curated knowledge notes are retrieved by embedding
// similarity. Degrades to a structured non-LLM summary when the API key is
// missing or the service is unreachable.
import { CONFIG } from './config.js'
import { log } from './util.js'
import { BAND_LABELS } from './risk.js'
import { WASHOUT_LABELS } from './washout.js'
import { classifyOni } from './sources/enso.js'

export function createRag({ db, riskEngine, washout, faq }) {
  const o = CONFIG.llm
  let probe = { reachable: false, checkedAt: 0 }

  // Key lives in the environment or the DB's kv table — never in committed
  // config. `scripts/set-llm-key.mjs` writes the kv entry.
  function apiKey() {
    return process.env.NVIDIA_NIM_KEY || db.kvGet('nim_api_key') || null
  }

  async function status(force = false) {
    // Successful probes cache for the full TTL; FAILED probes only briefly.
    // A single 5s timeout during the post-boot ingest burst used to gag the
    // chat behind a cached "unreachable" for 5 whole minutes.
    const ttl = probe.reachable ? o.probeTtlMs : 20_000
    if (!force && Date.now() - probe.checkedAt < ttl) return shape()
    const key = apiKey()
    if (!key) {
      probe = { reachable: false, checkedAt: Date.now() }
      return shape()
    }
    try {
      // Cheapest authenticated round-trip on the OpenAI-compatible surface.
      const res = await fetch(`${o.base}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      })
      probe = { reachable: res.ok, hasChat: res.ok, hasEmbed: res.ok, checkedAt: Date.now() }
      if (!res.ok) log('warn', 'NIM probe failed', { status: res.status })
    } catch (err) {
      probe = { reachable: false, checkedAt: Date.now() }
      log('warn', 'NIM unreachable', { error: String(err?.message ?? err) })
    }
    return shape()
  }
  function shape() {
    return { reachable: probe.reachable ?? false, hasChat: probe.hasChat ?? false,
             hasEmbed: probe.hasEmbed ?? false, chatModel: o.chatModel, embedModel: o.embedModel,
             configured: Boolean(apiKey()) }
  }

  // Callers pass nomic-style prefixed strings ("search_query: …" /
  // "search_document: …") from the Ollama era. Strip the prefix and translate
  // it to the input_type param NVIDIA's retrieval models expect, so every
  // call site keeps working unchanged.
  async function embed(texts) {
    const key = apiKey()
    if (!key) throw new Error('NIM key not configured')
    const isQuery = String(texts[0] ?? '').startsWith('search_query:')
    const cleaned = texts.map((t) =>
      String(t).replace(/^search_(query|document):\s*/, ''))
    const res = await fetch(`${o.base}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: o.embedModel,
        input: cleaned,
        encoding_format: 'float',
        input_type: isQuery ? 'query' : 'passage',
        truncate: 'END',
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`NIM embed HTTP ${res.status}`)
    const out = await res.json()
    if (!Array.isArray(out.data)) throw new Error('NIM embed: no embeddings')
    return out.data.map((d) => d.embedding)
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
  }

  // ── Lexical fallback retrieval ─────────────────────────────────────────
  // Vector search needs (a) an embedding API key and (b) a completed
  // embedding pass. When either is missing every stored note is invisible:
  // the old code filtered on `embedding IS NOT NULL` and returned [] , so a
  // corpus of real statistics sat in SQLite unreachable while the chat
  // answered "I don't have that information". That is the wrong failure for
  // a public-health tool — the numbers exist, they just weren't searchable.
  //
  // This scores documents on term overlap instead. It is plainly weaker than
  // cosine similarity (no synonyms, no semantics), but it is honest, needs no
  // API key, and keeps the corpus reachable when NIM is down or unfunded.
  //
  // Thai has no spaces between words, so a whitespace tokenizer alone would
  // never match a Thai query. We therefore ALSO substring-match Thai runs of
  // 2+ characters directly against the document text.
  const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'with', 'that', 'this',
    'from', 'what', 'how', 'why', 'when', 'where', 'is', 'in', 'of', 'to', 'a', 'an',
    'do', 'does', 'did', 'can', 'about', 'many', 'much', 'me', 'my', 'you'])

  function lexicalScore(question, docs, topK) {
    const q = question.toLowerCase()
    // Latin word tokens (>=3 chars, not stopwords) + numbers.
    const latin = (q.match(/[a-z0-9.]{3,}/g) ?? []).filter((t) => !STOP.has(t))
    // Contiguous Thai runs — used as substrings, not word tokens.
    const thai = (question.match(/[฀-๿]{2,}/g) ?? [])
    if (!latin.length && !thai.length) return []

    const scored = docs.map((d) => {
      const hay = `${d.title ?? ''}\n${d.content ?? ''}`
      const low = hay.toLowerCase()
      let score = 0
      for (const t of latin) {
        // Count occurrences, with diminishing returns so one repeated word
        // cannot dominate a document that matches many distinct terms.
        const n = low.split(t).length - 1
        if (n > 0) score += 1 + Math.log(n)
      }
      for (const t of thai) {
        // Longer Thai substrings are far more specific ("จุดความร้อน" beats
        // "ไฟ"), so weight by length.
        const n = hay.split(t).length - 1
        if (n > 0) score += (1 + Math.log(n)) * Math.min(3, t.length / 3)
      }
      // Title hits are strong signal — the H2 heading names the topic.
      const titleLow = (d.title ?? '').toLowerCase()
      for (const t of latin) if (titleLow.includes(t)) score += 2
      for (const t of thai) if ((d.title ?? '').includes(t)) score += 2
      return { ...d, score }
    })
    return scored.filter((d) => d.score > 0).sort((a, b) => b.score - a.score).slice(0, topK)
  }

  // topK=5 now that the corpus includes the full Air Bible (~800 chunks).
  async function retrieveKnowledge(question, topK = 5) {
    const embedded = db.all('SELECT doc_key, title, content, embedding FROM rag_docs WHERE embedding IS NOT NULL')
    if (embedded.length > 0) {
      try {
        const [qv] = await embed([`search_query: ${question}`])
        return embedded
          .map((d) => {
            const buf = d.embedding
            const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
            return { ...d, score: cosine(qv, vec) }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)
      } catch (err) {
        // Embedding service died mid-flight — fall through to lexical
        // rather than returning nothing.
        log('warn', 'vector retrieval failed — falling back to lexical', { error: String(err?.message ?? err) })
      }
    }
    const all = db.all('SELECT doc_key, title, content FROM rag_docs')
    if (all.length === 0) return []
    return lexicalScore(question, all, topK)
  }

  // ── Deterministic FACTS from SQLite ────────────────────────────────────────
  function matchProvinces(message) {
    const risk = riskEngine.get()
    const msg = message.toLowerCase()
    // Hat Yai is a district of Songkhla — the case that motivated this system.
    const aliases = [{ needle: 'หาดใหญ่', province_th: 'สงขลา' }, { needle: 'hat yai', province_th: 'สงขลา' }]
    const hits = new Map()
    for (const a of aliases) {
      if (msg.includes(a.needle)) {
        const p = risk.provinces.find((x) => x.province_th === a.province_th)
        if (p) hits.set(p.province_th, p)
      }
    }
    for (const p of risk.provinces) {
      if ((p.province_th && message.includes(p.province_th)) ||
          (p.province_en && msg.includes(p.province_en.toLowerCase()))) {
        hits.set(p.province_th, p)
      }
    }
    return [...hits.values()].slice(0, 3)
  }

  function matchStations(message) {
    // Stations whose (Thai) name literally appears inside the question.
    return db.all(
      `SELECT source, station_key, name_th, name_en, province_th, province_en
       FROM stations
       WHERE length(name_th) >= 3 AND instr(?, name_th) > 0
       LIMIT 6`, message)
  }

  function provinceFacts(p, lang) {
    const L = BAND_LABELS[p.band]
    const lines = [
      `${p.province_th} (${p.province_en ?? '-'}): score ${p.score}/100 = ${L.th} / ${L.en}`,
      `  AQ stations: ${p.aq_stations} (PM2.5 ≥75 affecting-health: ${p.stations_very_unhealthy}, ≥37.5 starting-to-affect: ${p.stations_unhealthy})`,
    ]
    if (p.pm25 !== null) lines.push(`  worst PM2.5 now: ${p.pm25} µg/m³ at ${p.pm25_station_th ?? '-'}`)
    if (p.top_stations?.length) lines.push(`  worst stations: ${p.top_stations.map((s) => `${s.th}/${s.en ?? '-'} ${s.pm25} µg/m³`).join(' · ')}`)
    if (p.rise_6h_ug !== null) lines.push(`  6h PM2.5 trend: ${p.rise_6h_ug > 0 ? '+' : ''}${p.rise_6h_ug} µg/m³`)
    if (p.pm25_fc_24h !== null) lines.push(`  CAMS forecast PM2.5 next 24h: ${Math.round(p.pm25_fc_24h)} µg/m³${p.pm25_fc_48h !== null ? `, 24–48h: ${Math.round(p.pm25_fc_48h)}` : ''}`)
    if (p.precip_prob_24h !== null) lines.push(`  rain chance 24h: ${Math.round(p.precip_prob_24h)}% (${Math.round(p.precip_fc_24h ?? 0)} mm forecast)` +
      (p.washout_relief_pct ? ` — if it rains, PM2.5 washes out ~${p.washout_relief_pct}% → ~${p.projected_pm25} µg/m³` : ''))
    if (p.rain_obs_24h !== null && p.rain_obs_24h >= 5) lines.push(`  observed rain 24h: ${Math.round(p.rain_obs_24h)} mm (washout underway)`)
    return lines.join('\n')
  }

  function stationFacts(matches) {
    const lines = []
    for (const m of matches) {
      const vals = db.all(
        'SELECT metric, value, obs_time FROM latest WHERE source = ? AND station_key = ?',
        m.source, m.station_key)
      if (vals.length === 0) continue
      const vs = vals.map((v) => `${v.metric}=${v.value} (${v.obs_time})`).join(', ')
      lines.push(`station ${m.name_th}/${m.name_en ?? '-'} (${m.province_th ?? '-'}): ${vs}`)
    }
    return lines
  }

  function buildFacts(message) {
    const risk = riskEngine.get()
    const n = risk.national
    const top = risk.provinces.slice(0, 8)
    const alerts = db.all('SELECT ts, message_th, message_en, severity FROM alerts ORDER BY id DESC LIMIT 8')
    const news = db.all('SELECT title FROM news_items ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT 5')
    const provinces = matchProvinces(message)
    const stations = matchStations(message)

    const parts = []
    parts.push(`Data time: ${risk.updated} (UTC). National status: ${BAND_LABELS[n.band].th} / ${BAND_LABELS[n.band].en}.` +
      (n.dustSeason ? ' Dust season is ACTIVE (burning window + widespread moderate PM2.5).' : ''))
    parts.push(`Provinces by band: normal=${n.bandCounts.normal} watch=${n.bandCounts.watch} elevated=${n.bandCounts.elevated} critical=${n.bandCounts.high}. ` +
      `Provinces past the Thai moderate line (PM2.5 ≥ 25 µg/m³): ${n.dustyProvinceCount}/${n.dustSampledCount} (${n.dustLoadPct}%).`)
    if (n.worstPm25) parts.push(`Highest PM2.5 now: ${n.worstPm25.ug} µg/m³ in ${n.worstPm25.province_th}/${n.worstPm25.province_en}.`)
    parts.push(`Top provinces by watch score:\n${top.map((p) => `- ${provinceFacts(p)}`).join('\n')}`)
    if (provinces.length) parts.push(`Provinces matched in the question:\n${provinces.map((p) => provinceFacts(p)).join('\n')}`)
    const sf = stationFacts(stations)
    if (sf.length) parts.push(`Stations matched in the question:\n${sf.join('\n')}`)
    if (alerts.length) parts.push(`Recent alerts:\n${alerts.map((a) => `- [sev${a.severity}] ${a.ts.slice(0, 16)} ${a.message_th} | ${a.message_en}`).join('\n')}`)
    if (news.length) parts.push(`Latest air-quality news headlines:\n${news.map((x) => `- ${x.title}`).join('\n')}`)

    // Ocean state (ENSO) — seasonal modulator.
    const anom = Number(db.kvGet('enso_anom'))
    if (Number.isFinite(anom)) {
      const cls = classifyOni(anom)
      parts.push(`Ocean state (ENSO): ${cls.en} / ${cls.th}, ONI ${anom > 0 ? '+' : ''}${anom.toFixed(1)} (${db.kvGet('enso_season')}). ` +
        `El Niño = drier/hotter = worse burning seasons (less washout rain); a modulator, not a predictor.`)
    }

    // Rain-washout outlook — where rain is coming and how much dust it clears.
    if (washout) {
      const w = [...washout.all().values()]
        .filter((x) => x.pm25 !== null)
        .sort((a, b) => (b.expected_relief_pct ?? 0) - (a.expected_relief_pct ?? 0))
        .slice(0, 6)
      if (w.length) {
        parts.push(`Rain-washout outlook (wet deposition — rain scavenges PM2.5; ≥5mm cuts ~20%, ≥15mm ~30%, ≥35mm ~40%):\n` +
          w.map((x) => `- ${x.province_th}: PM2.5 ${x.pm25} µg/m³, rain chance 24h ${Math.round(x.prob24 ?? 0)}% (${Math.round(x.rain_fc_24 ?? 0)} mm) → ${WASHOUT_LABELS[x.band].en}` +
            (x.relief_if_rain_pct ? `, if it rains PM2.5 → ~${x.projected_pm25} µg/m³ (−${x.relief_if_rain_pct}%)` : '')).join('\n'))
      }
    }

    parts.push(`Method note: ${risk.method_th} | ${risk.method_en}`)
    return parts.join('\n\n')
  }

  function systemPrompt(lang) {
    const langName = lang === 'th' ? 'Thai (ภาษาไทย)' : 'English'
    return `You are the assistant inside AirDash, a live air-quality and dust (PM2.5) dashboard for Thailand.
Answer in ${langName}. Be direct, calm, and factual — a duty officer's voice.

Hard rules:
- Use ONLY the numbers and facts in the FACTS and KNOWLEDGE blocks. NEVER estimate, extrapolate, or invent values.
- If the answer is not in FACTS/KNOWLEDGE, say you don't have that data and point to the closest thing you DO have.
- The watch score is a heuristic indicator from live data, NOT a forecast. Say so when asked about the future.
- Thai AQI 2023 PM2.5 lines: ≤15 very good, ≤25 good, ≤37.5 moderate, 37.5–75 starts affecting health, >75 affecting health. Never call ≤25 dangerous.
- Washout numbers are expectations from wet-deposition ratios, not measurements — say "expected" when citing them.
- Official guidance comes from PCD (hotline 1650) and DOH; medical emergencies 1669.
- Keep answers under 120 words. Thai station/province names first, English in parentheses when useful.
- Plain text only — no markdown, no asterisks, no headings. Short paragraphs or simple "-" lists.`
  }

  // ── Chat endpoint ──────────────────────────────────────────────────────────
  async function chat({ req, message, lang, res }) {
    const t0 = Date.now()
    const s = await status()
    const facts = buildFacts(message)

    // Log the question immediately (even if everything else fails).
    const logId = faq ? faq.logQuestion({ req, lang, message }) : null

    // FAQ cache hit — skip the LLM round-trip when a high-confidence
    // cached answer exists. The cached response is plain text from a
    // previously-approved operator-edited answer.
    if (faq) {
      const hit = await faq.tryFaqHit(message, lang)
      if (hit) {
        const body = hit.response_template
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({
          faq: true, faq_id: hit.id, faq_score: hit.score,
          message: body,
          knowledge: [],
          latency_ms: Date.now() - t0,
          pattern_th: hit.pattern_th, pattern_en: hit.pattern_en,
          log_id: logId,
        }))
        faq.recordOutcome({
          logId, message, servedFrom: 'faq', faqId: hit.id, faqScore: hit.score,
          factsLen: facts.length, knowledgeTitles: [],
          latencyMs: Date.now() - t0, responseLen: body.length,
        })
        return
      }
    }

    if (!s.reachable || !s.hasChat) {
      // Honest fallback: structured live summary, no generation.
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({
        offline: true,
        note_th: s.configured
          ? 'บริการ AI ไม่ตอบสนอง — แสดงสรุปข้อมูลจริงแทน'
          : 'ยังไม่ได้ตั้งค่า AI — แสดงสรุปข้อมูลจริงแทน',
        note_en: s.configured
          ? 'AI service unreachable — showing live data summary instead'
          : 'AI not configured yet — showing live data summary instead',
        facts,
      }))
      if (faq) faq.recordOutcome({
        logId, message, servedFrom: 'fallback',
        factsLen: facts.length, knowledgeTitles: [],
        latencyMs: Date.now() - t0,
      })
      return
    }

    const knowledge = await retrieveKnowledge(message)
    const kBlock = knowledge.length
      ? `\n\nKNOWLEDGE:\n${knowledge.map((k) => `[${k.title}]\n${k.content}`).join('\n---\n')}` : ''

    const upstream = await fetch(`${o.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({
        model: o.chatModel,
        stream: true,
        temperature: o.temperature,
        max_tokens: o.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt(lang) },
          { role: 'user', content: `FACTS:\n${facts}${kBlock}\n\nQUESTION: ${message}` },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!upstream.ok || !upstream.body) {
      log('error', 'NIM chat failed', { status: upstream.status })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ offline: true, note_th: 'บริการ AI ตอบไม่สำเร็จ', note_en: 'AI service failed to respond', facts }))
      if (faq) faq.recordOutcome({
        logId, message, servedFrom: 'error',
        factsLen: facts.length, knowledgeTitles: [],
        latencyMs: Date.now() - t0,
      })
      return
    }

    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    const decoder = new TextDecoder()
    let buffer = ''
    let responseLen = 0
    let doneSent = false
    const knowledgeTitles = knowledge.map((k) => k.title)
    const sendDone = () => {
      if (doneSent) return
      doneSent = true
      res.write(`data: ${JSON.stringify({ done: true, knowledge: knowledgeTitles, log_id: logId })}\n\n`)
    }
    try {
      // OpenAI-compatible SSE: frames are "data: {json}" lines, stream ends
      // with "data: [DONE]".
      for await (const chunk of upstream.body) {
        buffer += decoder.decode(chunk, { stream: true })
        let nl
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') { sendDone(); continue }
          try {
            const obj = JSON.parse(payload)
            const delta = obj?.choices?.[0]?.delta?.content
            if (delta) {
              responseLen += delta.length
              res.write(`data: ${JSON.stringify({ delta })}\n\n`)
            }
          } catch { /* partial frame — keep buffering */ }
        }
      }
      // Some providers close the stream without an explicit [DONE].
      sendDone()
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: 'stream interrupted' })}\n\n`)
      log('error', 'chat stream failed', { error: String(err) })
    }
    res.end()
    if (faq) faq.recordOutcome({
      logId, message, servedFrom: 'llm',
      factsLen: facts.length, knowledgeTitles,
      latencyMs: Date.now() - t0, responseLen,
    })
  }

  return { status: () => shape(), probe: status, embed, chat, buildFacts }
}
