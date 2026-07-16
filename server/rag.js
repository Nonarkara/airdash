// LLM chat over live data, via NVIDIA NIM's OpenAI-compatible API (free
// tier). The LLM never invents numbers: every figure is injected from SQLite
// into a FACTS block; curated knowledge notes are retrieved by embedding
// similarity. Degrades to a structured non-LLM summary when the API key is
// missing or the service is unreachable.
import { CONFIG } from './config.js'
import { log } from './util.js'
import { BAND_LABELS } from './risk.js'
import { buildCascade } from './cascade.js'
import { WETNESS_LABELS } from './wetness.js'
import { classifyOni } from './sources/enso.js'

export function createRag({ db, riskEngine, wetness, faq }) {
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

  // topK=5 now that the corpus includes the full Flood Bible (~800 chunks).
  async function retrieveKnowledge(question, topK = 5) {
    const docs = db.all('SELECT doc_key, title, content, embedding FROM rag_docs WHERE embedding IS NOT NULL')
    if (docs.length === 0) return []
    try {
      const [qv] = await embed([`search_query: ${question}`])
      return docs
        .map((d) => {
          const buf = d.embedding
          const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
          return { ...d, score: cosine(qv, vec) }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    } catch (err) {
      log('error', 'knowledge retrieval failed', { error: String(err) })
      return []
    }
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
      `  water-level stations: ${p.wl_stations} (level-5 overflowing: ${p.stations_l5}, level-4 high: ${p.stations_l4})`,
    ]
    if (p.top_wl.length) lines.push(`  worst stations: ${p.top_wl.map((s) => `${s.th}/${s.en ?? '-'} L${s.level}`).join(' · ')}`)
    if (p.max_rain_24h !== null) lines.push(`  max rain 24h: ${p.max_rain_24h} mm at ${p.max_rain_station_th}`)
    if (p.fc_48h !== null) lines.push(`  forecast rain next 48h (province centroid): ${Math.round(p.fc_48h)} mm`)
    const aqiRows = db.all(
      `SELECT s.name_th, l.value FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = 'air4thai' AND l.metric = 'pm25' AND s.province_th = ? LIMIT 2`, p.province_th)
    for (const r of aqiRows) lines.push(`  PM2.5 at ${r.name_th}: ${r.value} µg/m³`)
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
    parts.push(`Data time: ${risk.updated} (UTC). National status: ${BAND_LABELS[n.band].th} / ${BAND_LABELS[n.band].en}.`)
    parts.push(`Water-level stations by HII level (1 critically-low, 2 low, 3 normal, 4 high, 5 OVERFLOWING): ` +
      `L1=${n.byLevel[1]} L2=${n.byLevel[2]} L3=${n.byLevel[3]} L4=${n.byLevel[4]} L5=${n.byLevel[5]}.`)
    if (n.worstRain) parts.push(`Heaviest 24h rain now: ${n.worstRain.mm} mm in ${n.worstRain.province_th}/${n.worstRain.province_en}.`)
    parts.push(`Top provinces by watch score:\n${top.map((p) => `- ${provinceFacts(p)}`).join('\n')}`)
    if (provinces.length) parts.push(`Provinces matched in the question:\n${provinces.map((p) => provinceFacts(p)).join('\n')}`)
    const sf = stationFacts(stations)
    if (sf.length) parts.push(`Stations matched in the question:\n${sf.join('\n')}`)
    if (alerts.length) parts.push(`Recent alerts:\n${alerts.map((a) => `- [sev${a.severity}] ${a.ts.slice(0, 16)} ${a.message_th} | ${a.message_en}`).join('\n')}`)
    if (news.length) parts.push(`Latest flood news headlines:\n${news.map((x) => `- ${x.title}`).join('\n')}`)

    // Ocean state (ENSO) — seasonal modulator.
    const anom = Number(db.kvGet('enso_anom'))
    if (Number.isFinite(anom)) {
      const cls = classifyOni(anom)
      parts.push(`Ocean state (ENSO): ${cls.en} / ${cls.th}, ONI ${anom > 0 ? '+' : ''}${anom.toFixed(1)} (${db.kvGet('enso_season')}). ` +
        `La Niña raises wet-season flood odds but is a modulator, not a predictor.`)
    }

    // River cascade (connected waterways) — discharge + downstream lag.
    const cascade = buildCascade(db)
    const rising = cascade.reaches.filter((r) => r.trend === 'rising')
    const cpChain = cascade.flagship.map((f) =>
      `${f.name_en} q=${f.discharge ?? '?'}→peak ${f.forecastPeak ?? '?'} m³/s (+${f.cumLagDays}d to here)`).join(' → ')
    parts.push(`River discharge (GloFAS, m³/s). Chao Phraya cascade upstream→Bangkok: ${cpChain}. ` +
      `${rising.length} of ${cascade.reaches.length} reaches forecast rising. Lag = flood-wave travel time; ` +
      `a rise at an upstream reach reaches downstream after the stated days.`)

    // Catchment wetness (Antecedent Precipitation Index).
    if (wetness) {
      const wet = [...wetness.all().values()].sort((a, b) => b.api - a.api).slice(0, 6)
      if (wet.length) {
        parts.push(`Soil wetness (Antecedent Precipitation Index, higher = wetter ground = more runoff from the same rain):\n` +
          wet.map((w) => `- ${w.province_th}: API ${w.api} (${WETNESS_LABELS[w.band].en})`).join('\n'))
      }
    }

    parts.push(`Method note: ${risk.method_th} | ${risk.method_en}`)
    return parts.join('\n\n')
  }

  function systemPrompt(lang) {
    const langName = lang === 'th' ? 'Thai (ภาษาไทย)' : 'English'
    return `You are the assistant inside FloodDash, a live flood-monitoring dashboard for Thailand.
Answer in ${langName}. Be direct, calm, and factual — a duty officer's voice.

Hard rules:
- Use ONLY the numbers and facts in the FACTS and KNOWLEDGE blocks. NEVER estimate, extrapolate, or invent values.
- If the answer is not in FACTS/KNOWLEDGE, say you don't have that data and point to the closest thing you DO have.
- The watch score is a heuristic indicator from live data, NOT a forecast. Say so when asked about the future.
- HII water levels: 1–2 mean LOW water, 3 normal, 4 high, 5 overflowing. Never describe level 1–2 as flooding.
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
