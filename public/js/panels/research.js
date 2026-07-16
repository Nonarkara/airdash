// Research Paper panel — renders the full bilingual academic paper inside
// the About overlay's "Research Paper" tab, with custom SVG infographics,
// the complete source catalog, citations, and CSV dataset download.
import { on, store } from '../state.js?v=2.0.0-final'
import { getJson } from '../cache.js?v=2.0.0-final'
import { escapeHtml } from '../fmt.js?v=2.0.0-final'

function tr(th, en) { return store.lang === 'th' ? th : en }

// ── SVG generators ──────────────────────────────────────────────────────────

function svgArchitecture() {
  const w = 760, h = 320
  const sources = [
    { y: 20, label: 'HII', sub: 'water level', color: 'var(--rain)' },
    { y: 52, label: 'RAIN', sub: '~4,200 gauges', color: 'var(--rain)' },
    { y: 84, label: 'DAMS', sub: 'EGAT/RID', color: 'var(--dam)' },
    { y: 116, label: 'RID', sub: 'reservoirs', color: 'var(--dam)' },
    { y: 148, label: 'AIR4', sub: 'PM2.5', color: 'var(--aqi)' },
    { y: 180, label: 'OMET', sub: 'forecast', color: 'var(--band-watch)' },
    { y: 212, label: 'GLOF', sub: 'discharge', color: 'var(--rain)' },
    { y: 244, label: 'ONI', sub: 'ENSO', color: 'var(--band-elevated)' },
    { y: 276, label: 'NEWS', sub: 'RSS', color: 'var(--ink-mid)' },
  ]
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Source boxes
  for (const s of sources) {
    svg += `<rect x="10" y="${s.y}" width="110" height="26" fill="${s.color}" opacity="0.15" stroke="${s.color}" stroke-width="1"/>`
    svg += `<text x="18" y="${s.y + 12}" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--ink)">${s.label}</text>`
    svg += `<text x="18" y="${s.y + 22}" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">${s.sub}</text>`
    // Arrow to scheduler
    svg += `<line x1="120" y1="${s.y + 13}" x2="165" y2="160" stroke="var(--ink-low)" stroke-width="0.8" stroke-dasharray="2,2"/>`
  }
  // Scheduler
  svg += `<rect x="165" y="130" width="100" height="60" fill="var(--th-navy)" opacity="0.1" stroke="var(--th-navy)" stroke-width="1.5"/>`
  svg += `<text x="215" y="155" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--th-navy)">SCHEDULER</text>`
  svg += `<text x="215" y="170" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">timers · jitter</text>`
  svg += `<text x="215" y="180" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">backoff</text>`
  // Arrow to DB
  svg += `<line x1="265" y1="160" x2="310" y2="160" stroke="var(--th-navy)" stroke-width="1.5" marker-end="url(#arrowNavy)"/>`
  // SQLite WAL
  svg += `<rect x="310" y="125" width="100" height="70" fill="var(--dam)" opacity="0.1" stroke="var(--dam)" stroke-width="1.5"/>`
  svg += `<text x="360" y="148" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--dam)">SQLite</text>`
  svg += `<text x="360" y="162" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">WAL mode</text>`
  svg += `<text x="360" y="175" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">readings +</text>`
  svg += `<text x="360" y="186" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">hourly rollups</text>`
  // Arrow to bus
  svg += `<line x1="410" y1="160" x2="450" y2="160" stroke="var(--dam)" stroke-width="1.5" marker-end="url(#arrowDam)"/>`
  // Bus
  svg += `<rect x="450" y="130" width="90" height="60" fill="var(--band-elevated)" opacity="0.1" stroke="var(--band-elevated)" stroke-width="1.5"/>`
  svg += `<text x="495" y="155" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--band-elevated)">EVENT BUS</text>`
  svg += `<text x="495" y="170" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">SSE fanout</text>`
  svg += `<text x="495" y="180" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">+ events log</text>`
  // Arrow to API
  svg += `<line x1="540" y1="160" x2="580" y2="160" stroke="var(--band-elevated)" stroke-width="1.5" marker-end="url(#arrowOrange)"/>`
  // API
  svg += `<rect x="580" y="130" width="90" height="60" fill="var(--th-navy)" opacity="0.1" stroke="var(--th-navy)" stroke-width="1.5"/>`
  svg += `<text x="625" y="155" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--th-navy)">HTTP API</text>`
  svg += `<text x="625" y="170" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">JSON + SSE</text>`
  svg += `<text x="625" y="180" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">+ RAG chat</text>`
  // Arrow to dashboard
  svg += `<line x1="670" y1="160" x2="710" y2="160" stroke="var(--th-navy)" stroke-width="1.5" marker-end="url(#arrowNavy)"/>`
  // Dashboard
  svg += `<rect x="710" y="125" width="40" height="70" fill="var(--th-red)" opacity="0.1" stroke="var(--th-red)" stroke-width="1.5"/>`
  svg += `<text x="730" y="155" text-anchor="middle" font-family="var(--font-num)" font-size="9" font-weight="700" fill="var(--th-red)">DASH</text>`
  svg += `<text x="730" y="168" text-anchor="middle" font-family="var(--font-num)" font-size="9" font-weight="700" fill="var(--th-red)">BOARD</text>`
  // Retention note
  svg += `<text x="360" y="250" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-low)">raw → 90 days → hourly rollups (permanent)</text>`
  // Markers
  svg += `<defs>
    <marker id="arrowNavy" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="var(--th-navy)"/></marker>
    <marker id="arrowDam" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="var(--dam)"/></marker>
    <marker id="arrowOrange" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="var(--band-elevated)"/></marker>
  </defs>`
  svg += `</svg>`
  return svg
}

function svgScoreFormula() {
  const w = 600, h = 100
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Water 40%
  svg += `<rect x="10" y="20" width="224" height="50" fill="var(--rain)" opacity="0.15" stroke="var(--rain)" stroke-width="1"/>`
  svg += `<text x="122" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="14" font-weight="700" fill="var(--rain)">WATER 40%</text>`
  svg += `<text x="122" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">situation_level 1–5</text>`
  // Rain 25%
  svg += `<rect x="242" y="20" width="140" height="50" fill="var(--band-watch)" opacity="0.2" stroke="var(--band-watch)" stroke-width="1"/>`
  svg += `<text x="312" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="13" font-weight="700" fill="var(--band-elevated)">RAIN 25%</text>`
  svg += `<text x="312" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">rain_24h gauge max</text>`
  // Forecast 15%
  svg += `<rect x="390" y="20" width="84" height="50" fill="var(--band-elevated)" opacity="0.15" stroke="var(--band-elevated)" stroke-width="1"/>`
  svg += `<text x="432" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="var(--band-elevated)">FC 15%</text>`
  svg += `<text x="432" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">48h precip</text>`
  // Wetness 10%
  svg += `<rect x="482" y="20" width="52" height="50" fill="var(--band-high)" opacity="0.15" stroke="var(--band-high)" stroke-width="1"/>`
  svg += `<text x="508" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--band-high)">API 10%</text>`
  svg += `<text x="508" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="7.5" fill="var(--ink-mid)">wetness</text>`
  // Rise rate 10%
  svg += `<rect x="542" y="20" width="52" height="50" fill="var(--ink-mid)" opacity="0.12" stroke="var(--ink-mid)" stroke-width="1"/>`
  svg += `<text x="568" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="9.5" font-weight="700" fill="var(--ink-mid)">RISE 10%</text>`
  svg += `<text x="568" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="7.5" fill="var(--ink-mid)">6h Δwater</text>`
  // = sign
  svg += `<text x="300" y="90" text-anchor="middle" font-family="var(--font-num)" font-size="10.5" fill="var(--ink-mid)">score = 0.40·water + 0.25·rain + 0.15·forecast + 0.10·wetness + 0.10·rise_rate → round(0–100)</text>`
  svg += `</svg>`
  return svg
}

function svgRiskBands() {
  const w = 600, h = 50
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  const bands = [
    { x: 10, w: 120, c: 'var(--band-normal)', label: 'NORMAL', range: '0–19' },
    { x: 140, w: 140, c: 'var(--band-watch)', label: 'WATCH', range: '20–44' },
    { x: 290, w: 140, c: 'var(--band-elevated)', label: 'ELEVATED', range: '45–69' },
    { x: 440, w: 150, c: 'var(--band-high)', label: 'CRITICAL', range: '70–100' },
  ]
  for (const b of bands) {
    svg += `<rect x="${b.x}" y="8" width="${b.w}" height="28" fill="${b.c}" opacity="0.2" stroke="${b.c}" stroke-width="1.5"/>`
    svg += `<text x="${b.x + b.w / 2}" y="24" text-anchor="middle" font-family="var(--font-num)" font-size="11" font-weight="700" fill="${b.c}">${b.label}</text>`
    svg += `<text x="${b.x + b.w / 2}" y="36" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">${b.range}</text>`
  }
  svg += `</svg>`
  return svg
}

function svgCascade() {
  const w = 760, h = 200
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Ping
  svg += `<rect x="20" y="30" width="100" height="36" fill="var(--rain)" opacity="0.1" stroke="var(--rain)"/>`
  svg += `<text x="70" y="48" text-anchor="middle" font-family="var(--font-num)" font-size="11" font-weight="700" fill="var(--rain)">PING</text>`
  svg += `<text x="70" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">ต้นน้ำ</text>`
  // Nan
  svg += `<rect x="20" y="80" width="100" height="36" fill="var(--rain)" opacity="0.1" stroke="var(--rain)"/>`
  svg += `<text x="70" y="98" text-anchor="middle" font-family="var(--font-num)" font-size="11" font-weight="700" fill="var(--rain)">NAN</text>`
  svg += `<text x="70" y="110" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">ต้นน้ำ</text>`
  // Join arrows to Nakhon Sawan
  svg += `<line x1="120" y1="48" x2="175" y2="73" stroke="var(--rain)" stroke-width="1" marker-end="url(#arrRain)"/>`
  svg += `<line x1="120" y1="98" x2="175" y2="73" stroke="var(--rain)" stroke-width="1" marker-end="url(#arrRain)"/>`
  // Nakhon Sawan (confluence)
  svg += `<polygon points="175,60 205,73 175,86 145,73" fill="var(--th-navy)" opacity="0.15" stroke="var(--th-navy)" stroke-width="1.5"/>`
  svg += `<text x="175" y="76" text-anchor="middle" font-family="var(--font-num)" font-size="8" font-weight="700" fill="var(--th-navy)">น.ส.</text>`
  svg += `<text x="175" y="105" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">Nakhon Sawan</text>`
  // Chain downstream
  const reaches = [
    { x: 250, label: 'CHAI NAT', th: 'ชัยนาท', lag: '~1d' },
    { x: 370, label: 'AYUTTHAYA', th: 'อยุธยา', lag: '~3d' },
    { x: 490, label: 'BANGKOK', th: 'กรุงเทพฯ', lag: '~5d' },
  ]
  let prevX = 205
  for (const r of reaches) {
    svg += `<line x1="${prevX}" y1="73" x2="${r.x - 25}" y2="73" stroke="var(--th-navy)" stroke-width="1.5" marker-end="url(#arrNavy)"/>`
    svg += `<polygon points="${r.x},60 ${r.x + 30},73 ${r.x},86 ${r.x - 30},73" fill="var(--th-navy)" opacity="0.15" stroke="var(--th-navy)" stroke-width="1.5"/>`
    svg += `<text x="${r.x}" y="76" text-anchor="middle" font-family="var(--font-num)" font-size="8" font-weight="700" fill="var(--th-navy)">${r.label}</text>`
    svg += `<text x="${r.x}" y="105" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">${r.th}</text>`
    svg += `<text x="${r.x}" y="117" text-anchor="middle" font-family="var(--font-num)" font-size="9" font-weight="700" fill="var(--rain)">⏱ ${r.lag}</text>`
    prevX = r.x + 30
  }
  // Kinematic celerity note
  svg += `<text x="380" y="150" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-low)">flood-wave celerity c ≈ (5/3)·V — crest arrives before debris</text>`
  svg += `<text x="380" y="165" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">GloFAS discharge · per-reach thresholds (3 orders of magnitude)</text>`
  // Markers
  svg += `<defs>
    <marker id="arrRain" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="var(--rain)"/></marker>
    <marker id="arrNavy" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="var(--th-navy)"/></marker>
  </defs>`
  svg += `</svg>`
  return svg
}

function svgApiCurve() {
  const w = 400, h = 120
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Axes
  svg += `<line x1="40" y1="10" x2="40" y2="100" stroke="var(--ink-low)" stroke-width="1"/>`
  svg += `<line x1="40" y1="100" x2="380" y2="100" stroke="var(--ink-low)" stroke-width="1"/>`
  svg += `<text x="15" y="55" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)" transform="rotate(-90 15,55)">API</text>`
  svg += `<text x="210" y="115" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">days →</text>`
  // Recession curve: starts high, decays with k=0.92
  let path = 'M 40 25'
  for (let d = 0; d <= 14; d++) {
    const x = 40 + (d / 14) * 340
    const api = 100 * Math.pow(0.92, d)
    const y = 100 - (api / 120) * 85
    path += ` L ${x} ${y}`
  }
  svg += `<path d="${path}" fill="none" stroke="var(--rain)" stroke-width="2"/>`
  // Rain spike
  svg += `<rect x="80" y="30" width="4" height="70" fill="var(--band-watch)" opacity="0.6"/>`
  svg += `<text x="90" y="35" font-family="var(--font-num)" font-size="8" fill="var(--band-elevated)">P=25mm</text>`
  // Formula
  svg += `<text x="200" y="30" font-family="var(--font-num)" font-size="11" fill="var(--th-navy)">API_t = 0.92·API_{t-1} + P_t</text>`
  svg += `<text x="200" y="42" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">k=0.92, 14-day window</text>`
  // Bands
  svg += `<rect x="40" y="92" width="340" height="8" fill="var(--band-normal)" opacity="0.2"/>`
  svg += `<rect x="40" y="80" width="340" height="12" fill="var(--band-watch)" opacity="0.2"/>`
  svg += `<rect x="40" y="55" width="340" height="25" fill="var(--band-elevated)" opacity="0.15"/>`
  svg += `<rect x="40" y="15" width="340" height="40" fill="var(--band-high)" opacity="0.1"/>`
  svg += `</svg>`
  return svg
}

function svgEnso() {
  const w = 500, h = 80
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // La Niña
  svg += `<rect x="20" y="15" width="140" height="50" fill="#0039A6" opacity="0.12" stroke="#0039A6" stroke-width="1.5"/>`
  svg += `<text x="90" y="35" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="#0039A6">LA NIÑA</text>`
  svg += `<text x="90" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">ONI ≤ −0.5</text>`
  svg += `<text x="90" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">↑ rain odds</text>`
  // Neutral
  svg += `<rect x="180" y="15" width="140" height="50" fill="var(--ink-low)" opacity="0.12" stroke="var(--ink-low)" stroke-width="1.5"/>`
  svg += `<text x="250" y="35" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="var(--ink-mid)">NEUTRAL</text>`
  svg += `<text x="250" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">−0.5 < ONI < +0.5</text>`
  svg += `<text x="250" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">baseline</text>`
  // El Niño
  svg += `<rect x="340" y="15" width="140" height="50" fill="#E86A10" opacity="0.12" stroke="#E86A10" stroke-width="1.5"/>`
  svg += `<text x="410" y="35" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="#E86A10">EL NIÑO</text>`
  svg += `<text x="410" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">ONI ≥ +0.5</text>`
  svg += `<text x="410" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">↓ rain odds</text>`
  svg += `</svg>`
  return svg
}

function svgRetention() {
  const w = 600, h = 120
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Raw readings
  svg += `<rect x="10" y="30" width="130" height="50" fill="var(--band-elevated)" opacity="0.1" stroke="var(--band-elevated)"/>`
  svg += `<text x="75" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--band-elevated)">RAW READINGS</text>`
  svg += `<text x="75" y="65" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">~2–3 GB</text>`
  svg += `<text x="75" y="75" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">retained 90 days</text>`
  // Arrow
  svg += `<line x1="140" y1="55" x2="195" y2="55" stroke="var(--th-navy)" stroke-width="1.5" marker-end="url(#arrR)"/>`
  svg += `<text x="167" y="48" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">nightly</text>`
  // Hourly rollups
  svg += `<rect x="195" y="30" width="140" height="50" fill="var(--dam)" opacity="0.1" stroke="var(--dam)"/>`
  svg += `<text x="265" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--dam)">HOURLY ROLLUPS</text>`
  svg += `<text x="265" y="65" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">min/max/avg</text>`
  svg += `<text x="265" y="75" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">PERMANENT</text>`
  // Arrow
  svg += `<line x1="335" y1="55" x2="390" y2="55" stroke="var(--dam)" stroke-width="1.5" marker-end="url(#arrR)"/>`
  // Events log
  svg += `<rect x="390" y="30" width="120" height="50" fill="var(--th-navy)" opacity="0.1" stroke="var(--th-navy)"/>`
  svg += `<text x="450" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--th-navy)">EVENTS LOG</text>`
  svg += `<text x="450" y="65" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">auditable</text>`
  svg += `<text x="450" y="75" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">replay</text>`
  // Arrow to export
  svg += `<line x1="510" y1="55" x2="555" y2="55" stroke="var(--th-navy)" stroke-width="1.5" marker-end="url(#arrR)"/>`
  // Export
  svg += `<rect x="555" y="35" width="35" height="40" fill="var(--th-red)" opacity="0.1" stroke="var(--th-red)"/>`
  svg += `<text x="572" y="55" text-anchor="middle" font-family="var(--font-num)" font-size="8" font-weight="700" fill="var(--th-red)">CSV</text>`
  svg += `<text x="572" y="67" text-anchor="middle" font-family="var(--font-num)" font-size="7" fill="var(--ink-mid)">↓</text>`
  svg += `<defs><marker id="arrR" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="var(--th-navy)"/></marker></defs>`
  svg += `</svg>`
  return svg
}

// ── Content sections ────────────────────────────────────────────────────────

function sectionHero() {
  return `
    <div class="rp-hero">
      <div class="rp-hero-eyebrow">RESEARCH PAPER · v1.0 — July 2026</div>
      <h1 class="rp-hero-title" data-th="FloodDash — ระบบเฝ้าระวังน้ำท่วมเรียลไทม์โอเพนซอร์สสำหรับประเทศไทย" data-en="FloodDash — A Real-Time, Open-Source Flood Watch for Thailand">
        ${tr('FloodDash — ระบบเฝ้าระวังน้ำท่วมเรียลไทม์โอเพนซอร์สสำหรับประเทศไทย', 'FloodDash — A Real-Time, Open-Source Flood Watch for Thailand')}
      </h1>
      <div class="rp-hero-meta">
        <div><strong>Dr Non Arkaraprasertkul</strong> · ดร.นน อัครประเสริฐกุล</div>
        <div>Senior Expert, Smart City Promotion Department · depa</div>
        <div><code>non.ar@depa.or.th</code> · <a href="https://smartcitythailand.or.th" target="_blank" rel="noopener">smartcitythailand.or.th</a></div>
      </div>
      <div class="rp-abstract">
        <p data-th="FloodDash เป็นระบบเฝ้าระวังน้ำท่วม 24/7 ที่ทำงานบนเครื่องเดียว เชื่อมข้อมูลเปิดจาก 9 แหล่ง (ระดับน้ำ สสน. · ฝน ~4,200 สถานี · เขื่อน · อ่างเก็บน้ำ · PM2.5 · พยากรณ์ · GloFAS · ENSO · ข่าว) ผ่านแดชบอร์ดสองภาษา ข้อมูลทุกค่าถูกเก็บลง SQLite แล้วสรุปเป็นรายชั่วโมงถาวรหลัง 90 วัน ระบบแสดงดัชนีเฝ้าระวังรายจังหวัด (น้ำ 40% · ฝน 25% · พยากรณ์ 15% · ความชุ่มน้ำ 10% · อัตราเพิ่มระดับน้ำ 10%) และกราฟต้นน้ำ-ปลายน้ำ — ทั้งสองเป็น "ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์"" data-en="FloodDash is a 24/7 single-machine flood-monitoring system for Thailand. It unifies nine open public data pipelines into a single bilingual dashboard. Every reading is persisted to SQLite; raw rows are rolled into hourly aggregates after 90 days. The system presents a province-level watch score (water 40% · rain 25% · forecast 15% · wetness 10% · rise rate 10%) and a per-reach connected-waterways cascade. Both are explicitly framed as heuristic indicators, not forecasts.">
          ${tr(
            'FloodDash เป็นระบบเฝ้าระวังน้ำท่วม 24/7 ที่ทำงานบนเครื่องเดียว เชื่อมข้อมูลเปิดจาก 10 แหล่ง (ระดับน้ำ สสน. · ฝน ~4,200 สถานี · เขื่อน · อ่างเก็บน้ำ · PM2.5 · พยากรณ์ · GloFAS · ENSO · ฝนดาวเทียม NASA GPM · ข่าว) ผ่านแดชบอร์ดสองภาษา ข้อมูลทุกค่าถูกเก็บลง SQLite แล้วสรุปเป็นรายชั่วโมงถาวรหลัง 90 วัน ระบบแสดงดัชนีเฝ้าระวังรายจังหวัด (น้ำ 40% · ฝน 25% · พยากรณ์ 15% · ความชุ่มน้ำ 10% · อัตราเพิ่มระดับน้ำ 10%) และกราฟต้นน้ำ-ปลายน้ำ — ทั้งสองเป็น "ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์"',
            'FloodDash is a 24/7 single-machine flood-monitoring system for Thailand. It unifies ten open public data pipelines into a single bilingual dashboard. Every reading is persisted to SQLite; raw rows are rolled into hourly aggregates after 90 days. The system presents a province-level watch score (water 40% · rain 25% · forecast 15% · wetness 10% · rise rate 10%) and a per-reach connected-waterways cascade. Both are explicitly framed as heuristic indicators, not forecasts.'
          )}
        </p>
      </div>
    </div>`
}

function sectionArchitecture() {
  return `
    <section class="rp-section">
      <h2 data-th="2. สถาปัตยกรรมระบบ" data-en="2. System Architecture">${tr('2. สถาปัตยกรรมระบบ', '2. System Architecture')}</h2>
      <div class="rp-figure">${svgArchitecture()}</div>
      <p data-th="ดีไซน์รวมทุกอย่างในโปรเซสเดียว — รันบน Raspberry Pi หรือแล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ เหตุการณ์ทุกอย่างผ่านบัสเดียวและถูกเขียนลงตาราง events ทำให้ท่อข้อมูลสดเป็นล็อกที่ query ได้ RAG ที่ใช้ LLaMA เป็นทางเลือก ถ้าไม่มีโมเดล local แชทบอทจะถอยไปแสดงสรุปข้อมูลสดแบบมีโครงสร้าง" data-en="The single-process design means the system runs on a Raspberry Pi or a retired office laptop, the database is a single file, and the entire surface is auditable. All events go through one bus and are written to an events table so the running tap is also a queryable log. The LLaMA-based RAG is optional: with no local model, the chatbot gracefully degrades to a structured live-data summary.">
        ${tr(
          'ดีไซน์รวมทุกอย่างในโปรเซสเดียว — รันบน Raspberry Pi หรือแล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ เหตุการณ์ทุกอย่างผ่านบัสเดียวและถูกเขียนลงตาราง events ทำให้ท่อข้อมูลสดเป็นล็อกที่ query ได้ RAG ที่ใช้ LLaMA เป็นทางเลือก ถ้าไม่มีโมเดล local แชทบอทจะถอยไปแสดงสรุปข้อมูลสดแบบมีโครงสร้าง',
          'The single-process design means the system runs on a Raspberry Pi or a retired office laptop, the database is a single file, and the entire surface is auditable. All events go through one bus and are written to an events table so the running tap is also a queryable log. The LLaMA-based RAG is optional: with no local model, the chatbot gracefully degrades to a structured live-data summary.'
        )}
      </p>
    </section>`
}

function sectionSources(catalog) {
  const pipelines = catalog?.pipelines ?? []
  const cards = pipelines.map((s, i) => {
    const name = tr(s.name_th, s.name_en)
    const agency = tr(s.agency_th, s.agency_en)
    const cadence = tr(s.cadence_th, s.cadence_en)
    const note = tr(s.note_th, s.note_en)
    const metrics = (s.metrics ?? []).join(' · ')
    return `
      <div class="rp-pipeline-card">
        <div class="rp-pipeline-num">${i + 1}</div>
        <div class="rp-pipeline-body">
          <div class="rp-pipeline-name">${escapeHtml(name)}</div>
          <div class="rp-pipeline-agency">${escapeHtml(agency)}</div>
          <div class="rp-pipeline-meta">
            <span class="rp-tag">${escapeHtml(cadence)}</span>
            ${metrics ? `<span class="rp-tag rp-tag-mono">${escapeHtml(metrics)}</span>` : ''}
          </div>
          <div class="rp-pipeline-note">${escapeHtml(note)}</div>
          ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="rp-pipeline-link">${escapeHtml(s.url)}</a>` : ''}
        </div>
      </div>`
  }).join('')
  return `
    <section class="rp-section">
      <h2 data-th="3. แหล่งข้อมูล — 10 ท่อสาธารณะ" data-en="3. Data Sources — 10 Public Pipelines">${tr('3. แหล่งข้อมูล — 10 ท่อสาธารณะ', '3. Data Sources — 10 Public Pipelines')}</h2>
      <p class="rp-lead" data-th="ทุกแหล่งข้อมูลเป็นสาธารณะ เข้าถึงได้โดยไม่ต้องใช้คีย์ และอ่านได้อย่างเดียว แต่ละท่อทำงานเป็นโมดูลใน server/sources/*.js" data-en="All sources are public, keyless, and read-only. Each runs as a module with a run({ db, bus }) contract that returns a { seen, added } summary.">
        ${tr('ทุกแหล่งข้อมูลเป็นสาธารณะ เข้าถึงได้โดยไม่ต้องใช้คีย์ และอ่านได้อย่างเดียว', 'All sources are public, keyless, and read-only. Each runs as a module with a run({ db, bus }) contract.')}
      </p>
      <div class="rp-pipeline-grid">${cards}</div>
      ${catalog?.jaxa ? `<div class="rp-jaxa-note">
        <strong>JAXA / NASA GIBS:</strong> ${tr(catalog.jaxa.note_th, catalog.jaxa.note_en)}
      </div>` : ''}
    </section>`
}

function sectionScore() {
  return `
    <section class="rp-section">
      <h2 data-th="4. คะแนนเฝ้าระวังรายจังหวัด" data-en="4. The Province Watch Score">${tr('4. คะแนนเฝ้าระวังรายจังหวัด', '4. The Province Watch Score')}</h2>
      <div class="rp-figure">${svgScoreFormula()}</div>
      <div class="rp-figure">${svgRiskBands()}</div>
      <p data-th="น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองอุทกวิทยาที่ปรับเทียบแล้ว ระดับน้ำเป็นสัญญาณหลักเพราะการล้นตลิ่ง (ระดับ 4–5) เป็นเหตุการณ์ที่หายากและมีผลกระทบสูง ฝนเป็นสัญญาณนำ จึงได้ 25% พยากรณ์ได้ 15% เพราะเป็นตัวแก้อคติที่มีประโยชน์ แต่หยาบเกินจะขับเคลื่อนการจัดอันดับเพียงลำพัง ความชุ่มน้ำ (10%) และอัตราการเพิ่มระดับน้ำ (10%) เป็นตัวแปรที่เพิ่มเข้ามา: ดินชุ่มทำให้น้ำท่าเพิ่ม 3–4 เท่า และระดับน้ำที่เพิ่มเร็วคือสัญญาณน้ำท่วมฉับพลันที่ใกล้เคียงที่สุด คะแนนนี้เป็นดัชนีเฝ้าระวังจากข้อมูลจริง ไม่ใช่การพยากรณ์น้ำท่วม" data-en="The weights are a deliberate operational choice, not a calibrated hydrology model. Water is the dominant signal because overflow (level 4–5) is the rare, high-consequence event. Rain is the leading indicator — it shows up hours before water rises — so it gets 25%. Forecast gets 15% because the 48-h forecast is a useful bias corrector but too coarse to drive a ranking alone. Wetness (10%) and rise rate (10%) are the newer additions: wet ground amplifies runoff 3–4x, and a sudden rise is the closest thing to a flash-flood signal without a hydraulic model. The score is a live watch indicator, not a flood forecast.">
        ${tr(
          'น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองอุทกวิทยาที่ปรับเทียบแล้ว ระดับน้ำเป็นสัญญาณหลักเพราะการล้นตลิ่งเป็นเหตุการณ์ที่หายากและมีผลกระทบสูง ฝนเป็นสัญญาณนำ จึงได้ 25% พยากรณ์ได้ 15% เพราะเป็นตัวแก้อคติที่มีประโยชน์ ความชุ่มน้ำ (10%) และอัตราการเพิ่มระดับน้ำ (10%) เป็นตัวแปรที่เพิ่มเข้ามาเพื่อจับสัญญาณน้ำท่วมฉับพลัน คะแนนนี้เป็นดัชนีเฝ้าระวังจากข้อมูลจริง ไม่ใช่การพยากรณ์น้ำท่วม',
          'The weights are a deliberate operational choice, not a calibrated hydrology model. Water is the dominant signal because overflow is the rare, high-consequence event. Rain is the leading indicator, so it gets 25%. Forecast gets 15% because the 48-h forecast is a useful bias corrector but too coarse to drive a ranking alone. Wetness (10%) and rise rate (10%) were added to catch flash-flood-style signals. The score is a live watch indicator, not a flood forecast.'
        )}
      </p>
    </section>`
}

function sectionCascade() {
  return `
    <section class="rp-section">
      <h2 data-th="5. เส้นทางน้ำเชื่อมโยง (กราฟต้นน้ำ-ปลายน้ำ)" data-en="5. Connected Waterways (Cascade Graph)">${tr('5. เส้นทางน้ำเชื่อมโยง', '5. Connected Waterways')}</h2>
      <div class="rp-figure">${svgCascade()}</div>
      <p data-th="เครือข่ายแม่น้ำเป็นกราฟมีทิศทาง — น้ำไหลลงปลายน้ำเสมอ เจ้าพระยาเป็นตัวอย่างหลัก: ปิงกับน่านมาบรรจบที่นครสวรรค์ แล้วไหลผ่านชัยนาท อยุธยา ถึงกรุงเทพฯ 5 วันหลังต้นน้ำ คลื่นน้ำท่วมเดินทางด้วยความเร็วคลื่น c ≈ (5/3)·V ทำให้ยอดคลื่นอาจมาถึงปลายน้ำก่อนเศษวัสดุลอย" data-en="A river network is a directed graph. The Chao Phraya is the flagship: Ping and Nan join at Nakhon Sawan, then the combined river travels through Chai Nat, Ayutthaya, and reaches Bangkok 5 days after the headwaters. The flood wave travels at kinematic celerity c ≈ (5/3)·V, so the crest can arrive downstream before floating debris.">
        ${tr(
          'เครือข่ายแม่น้ำเป็นกราฟมีทิศทาง เจ้าพระยาเป็นตัวอย่างหลัก: ปิงกับน่านมาบรรจบที่นครสวรรค์ แล้วไหลผ่านชัยนาท อยุธยา ถึงกรุงเทพฯ 5 วันหลังต้นน้ำ',
          'A river network is a directed graph. The Chao Phraya: Ping and Nan join at Nakhon Sawan, then travel through Chai Nat, Ayutthaya, reaching Bangkok 5 days after the headwaters.'
        )}
      </p>
    </section>`
}

function sectionApi() {
  return `
    <section class="rp-section">
      <h2 data-th="6. ดัชนีฝนสะสมถ่วงเวลา (API)" data-en="6. Antecedent Precipitation Index (API)">${tr('6. ดัชนีฝนสะสมถ่วงเวลา (API)', '6. Antecedent Precipitation Index')}</h2>
      <div class="rp-figure">${svgApiCurve()}</div>
      <p data-th="สองจังหวัดที่ฝนเท่ากันวันนี้ไม่ได้เสี่ยงเท่ากัน ถ้าจังหวัดหนึ่งโดนฝนติดต่อกันอาทิตย์ ดินชุ่มมีความสามารถในการซึมต่ำ น้ำท่าเพิ่ม 3–4 เท่า ทำให้ API เป็นสัญญาณนำ" data-en="Two provinces with equal rain today are not equally dangerous if one has been soaking for a week — wet ground has low infiltration capacity, so runoff turns the same rainfall into 3–4× the flood volume. This makes API a leading indicator.">
        ${tr(
          'สองจังหวัดที่ฝนเท่ากันวันนี้ไม่ได้เสี่ยงเท่ากัน ถ้าจังหวัดหนึ่งโดนฝนติดต่อกันอาทิตย์ ดินชุ่มมีความสามารถในการซึมต่ำ น้ำท่าเพิ่ม 3–4 เท่า',
          'Two provinces with equal rain today are not equally dangerous if one has been soaking for a week — wet ground has low infiltration capacity, so runoff turns the same rainfall into 3–4× the flood volume.'
        )}
      </p>
    </section>`
}

function sectionEnso() {
  return `
    <section class="rp-section">
      <h2 data-th="7. ENSO เป็นตัวปรับความเสี่ยง (ไม่ใช่ตัวพยากรณ์)" data-en="7. ENSO as a Risk Modulator">${tr('7. ENSO เป็นตัวปรับความเสี่ยง', '7. ENSO as a Risk Modulator')}</h2>
      <div class="rp-figure">${svgEnso()}</div>
      <p data-th="Oceanic Niño Index ดึงทุก 12 ชม. ลานีญาเพิ่มโอกาสฝนมากในหน้าฝน น้ำท่วมใหญ่ปี 2554 เป็นเหตุการณ์ลานีญาผสม แต่นี่คือปัจจัยก่อนเหตุ ไม่ใช่ตัวพยากรณ์" data-en="The Oceanic Niño Index is fetched every 12 hours. La Niña raises Thailand's wet-season rain odds — the 2011 Great Flood was a La Niña compound event. This is a prior, not a predictor.">
        ${tr(
          'Oceanic Niño Index ดึงทุก 12 ชม. ลานีญาเพิ่มโอกาสฝนมากในหน้าฝน น้ำท่วมใหญ่ปี 2554 เป็นเหตุการณ์ลานีญาผสม',
          'The Oceanic Niño Index is fetched every 12 hours. La Niña raises Thailand\'s wet-season rain odds — the 2011 Great Flood was a La Niña compound event.'
        )}
      </p>
    </section>`
}

function sectionRetention() {
  return `
    <section class="rp-section">
      <h2 data-th="8. การเก็บข้อมูลระยะยาว" data-en="8. Data Retention & Storage">${tr('8. การเก็บข้อมูลระยะยาว', '8. Data Retention & Storage')}</h2>
      <div class="rp-figure">${svgRetention()}</div>
      <p data-th="ข้อมูลดิบเก็บ 90 วัน แล้วสรุปเป็น hourly aggregate ถาวร ตาราง readings ใช้ INSERT OR IGNORE ป้องกันข้อมูลซ้ำ ตาราง events เก็บทุกเหตุการณ์ของท่อพร้อมการแจ้งเตือนเกินเกณฑ์ที่มี cooldown 6 ชม." data-en="Raw rows are kept 90 days, then collapsed into permanent hourly aggregates (min, max, average). The readings table uses INSERT OR IGNORE to prevent duplicates. The events table stores every pipeline event with 6-hour-cooldown threshold-crossing alerts.">
        ${tr(
          'ข้อมูลดิบเก็บ 90 วัน แล้วสรุปเป็น hourly aggregate ถาวร ตาราง readings ใช้ INSERT OR IGNORE ป้องกันข้อมูลซ้ำ',
          'Raw rows are kept 90 days, then collapsed into permanent hourly aggregates. The readings table uses INSERT OR IGNORE to prevent duplicates.'
        )}
      </p>
    </section>`
}

function sectionLimitations() {
  const items = [
    { th: 'คะแนนเฝ้าระวังเป็นตัวบ่งชี้เชิงประเมิน ไม่ใช่การพยากรณ์น้ำท่วม', en: 'The watch score is a heuristic indicator, not a flood forecast.' },
    { th: 'กราฟต้นน้ำ-ปลายน้ำเป็น Muskingum-style routing อันดับหนึ่ง ไม่คำนึงถึงน้ำทะเลหนุบและการระบายน้ำของเขื่อนรายชั่วโมง', en: 'The cascade is a first-order Muskingum-style routing. It ignores backwater, tidal backflow, and hour-by-hour dam operations.' },
    { th: 'คุณภาพอากาศเป็นบริบทเท่านั้น ไม่ได้พยากรณ์ AQI', en: 'Air quality is context only — the dashboard does not predict AQI.' },
    { th: 'GloFAS grid กว้าง 5 กม. อาจครอบตลิ่งหรือพลาดท่อระบายน้ำในเมือง', en: 'The GloFAS grid is 5 km — a single cell can straddle a levee or miss an urban drain.' },
    { th: 'ENSO เป็นบริบทตามฤดูกาล ไม่ใช่ตัวพยากรณ์ระยะสั้น', en: 'The ENSO chip is seasonal context, not a short-term predictor.' },
    { th: 'ข่าว RSS กรองด้วยคำค้น (น้ำท่วม อุทกภัย น้ำป่า น้ำล้นตลิ่ง ฝนตกหนัก ดินถล่ม ระบายน้ำ มวลน้ำ flood) ไม่ใช่ข่าวท้องถิ่นครบถ้วน', en: 'The news RSS is keyword-filtered and not a substitute for local news.' },
    { th: 'แชทบอทตอบจากข้อมูลใน SQLite และไฟล์ความรู้เท่านั้น ไม่เห็นสิ่งที่หน่วยงานไม่เผยแพร่', en: 'The chatbot is grounded in SQLite numbers and knowledge files; it cannot see what agencies do not publish.' },
  ]
  const list = items.map((it) => `<li>${tr(it.th, it.en)}</li>`).join('')
  return `
    <section class="rp-section">
      <h2 data-th="9. ข้อจำกัดที่ต้องพูดตรง ๆ" data-en="9. Honest Limitations">${tr('9. ข้อจำกัดที่ต้องพูดตรง ๆ', '9. Honest Limitations')}</h2>
      <ul class="rp-limitations">${list}</ul>
      <div class="rp-warning" data-th="ฟังประกาศทางการของ ปภ. / กรมอุตุฯ / สทนช. เสมอ ระบบนี้จัดทำเพื่อจัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย" data-en="Always follow official DDPM / TMD / ONWR warnings. This system is for prioritisation, not for issuing alerts.">
        ⚠ ${tr('ฟังประกาศทางการของ ปภ. / กรมอุตุฯ / สทนช. เสมอ — ระบบนี้จัดทำเพื่อจัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย', 'Always follow official DDPM / TMD / ONWR warnings — this system is for prioritisation, not for issuing alerts.')}
      </div>
    </section>`
}

function sectionCitations() {
  const cites = [
    'Kohler, M. A. & Linsley, R. K. (1951). Predicting the runoff from storm rainfall. U.S. Weather Bureau Research Paper 34.',
    'Horton, R. E. (1933). The rôle of infiltration in the hydrologic cycle. Trans. AGU 14, 446–460.',
    'Chow, V. T., Maidment, D. R. & Mays, L. W. (1988). Applied Hydrology. McGraw-Hill. (Muskingum method)',
    'Lighthill, M. J. & Whitham, G. B. (1955). On kinematic waves I: flood movement in long rivers. Proc. R. Soc. A 229, 281–316.',
    'NOAA CPC — Oceanic Niño Index: cpc.ncep.noaa.gov/data/indices/oni.ascii.txt',
    'Copernicus GloFAS via Open-Meteo Flood API: open-meteo.com/en/docs/flood-api',
    'Hydro-Informatics Institute (HII) ThaiWater: thaiwater.net',
    'Royal Irrigation Department (RID) reservoir API.',
    'Pollution Control Department (PCD) Air4Thai: air4thai.pcd.go.th',
    'Smart City Thailand Office: smartcitythailand.or.th',
    'JAXA GSMaP / Himawari: earth.jaxa.jp · eorc.jaxa.jp/ptree',
    'NASA GIBS: gibs.earthdata.nasa.gov',
    'GISTDA — Thai river network GeoJSON.',
  ]
  const list = cites.map((c) => `<li>${c}</li>`).join('')
  return `
    <section class="rp-section">
      <h2 data-th="10. อ้างอิงและเอกสารที่เกี่ยวข้อง" data-en="10. Citations & References">${tr('10. อ้างอิงและเอกสารที่เกี่ยวข้อง', '10. Citations & References')}</h2>
      <ul class="rp-citations">${list}</ul>
    </section>`
}

function sectionDownload() {
  return `
    <section class="rp-section rp-download-section">
      <h2 data-th="ดาวน์โหลดชุดข้อมูล" data-en="Download the Dataset">${tr('ดาวน์โหลดชุดข้อมูล', 'Download the Dataset')}</h2>
      <p class="rp-lead" data-th="ข้อมูลทุกค่าที่ FloodDash เก็บถาวร (hourly aggregates) พร้อมข้อมูล metadata ของสถานี สามารถดาวน์โหลดเป็น CSV เพื่อวิเคราะห์ต่อได้ทันที" data-en="Every permanent hourly aggregate FloodDash has stored, with full station metadata, downloadable as CSV for offline analysis.">
        ${tr(
          'ข้อมูลทุกค่าที่ FloodDash เก็บถาวร พร้อม metadata ของสถานี ดาวน์โหลดเป็น CSV ได้ทันที',
          'Every permanent hourly aggregate FloodDash has stored, with full station metadata, downloadable as CSV.'
        )}
      </p>
      <div class="rp-download-actions">
        <button class="rp-download-btn" id="rp-download-full">
          <span class="rp-download-icon">⬇</span>
          <span class="rp-download-label" data-th="ดาวน์โหลดข้อมูลทั้งหมด (CSV)" data-en="Download Full Dataset (CSV)">${tr('ดาวน์โหลดข้อมูลทั้งหมด (CSV)', 'Download Full Dataset (CSV)')}</span>
        </button>
        <button class="rp-download-btn rp-download-btn--weekly" id="rp-download-weekly">
          <span class="rp-download-icon">📦</span>
          <span class="rp-download-label" data-th="ดาวน์โหลดชุดข้อมูลรายสัปดาห์ (.tar.gz)" data-en="Download Weekly Archive (.tar.gz)">${tr('ดาวน์โหลดชุดข้อมูลรายสัปดาห์ (.tar.gz)', 'Download Weekly Archive (.tar.gz)')}</span>
        </button>
        <div class="rp-download-meta" id="rp-download-meta"></div>
        <div class="rp-download-meta" id="rp-download-weekly-meta"></div>
      </div>
      <div class="rp-dict">
        <h3 data-th="พจนานุกรมข้อมูล (Data Dictionary)" data-en="Data Dictionary">${tr('พจนานุกรมข้อมูล', 'Data Dictionary')}</h3>
        <table class="rp-dict-table">
          <thead><tr><th>Column</th><th>Type</th><th data-th="คำอธิบาย" data-en="Description">${tr('คำอธิบาย', 'Description')}</th></tr></thead>
          <tbody>
            <tr><td><code>date</code></td><td>text</td><td data-th="วันที่ YYYY-MM-DD" data-en="Date YYYY-MM-DD">${tr('วันที่ YYYY-MM-DD', 'Date YYYY-MM-DD')}</td></tr>
            <tr><td><code>hour</code></td><td>text</td><td data-th="ชั่วโมง YYYY-MM-DDTHH:00" data-en="Hour YYYY-MM-DDTHH:00">${tr('ชั่วโมง YYYY-MM-DDTHH:00', 'Hour YYYY-MM-DDTHH:00')}</td></tr>
            <tr><td><code>source</code></td><td>text</td><td data-th="รหัสแหล่งข้อมูล (thaiwater_wl, thaiwater_rain, ฯลฯ)" data-en="Source ID (thaiwater_wl, thaiwater_rain, etc.)">${tr('รหัสแหล่งข้อมูล', 'Source ID')}</td></tr>
            <tr><td><code>station_key</code></td><td>text</td><td data-th="รหัสสถานี" data-en="Station identifier">${tr('รหัสสถานี', 'Station identifier')}</td></tr>
            <tr><td><code>metric</code></td><td>text</td><td data-th="ตัวชี้วัด (wl_msl, rain_24h, situation_level, ฯลฯ)" data-en="Metric name (wl_msl, rain_24h, situation_level, etc.)">${tr('ตัวชี้วัด', 'Metric name')}</td></tr>
            <tr><td><code>v_min / v_max / v_avg</code></td><td>real</td><td data-th="ค่าต่ำสุด/สูงสุด/เฉลี่ยในชั่วโมงนั้น" data-en="Min/max/average for that hour">${tr('ค่าต่ำสุด/สูงสุด/เฉลี่ยในชั่วโมงนั้น', 'Min/max/average for that hour')}</td></tr>
            <tr><td><code>samples</code></td><td>int</td><td data-th="จำนวนการอ่านค่าดิบที่นำมาสรุป" data-en="Number of raw readings rolled up">${tr('จำนวนการอ่านค่าดิบที่นำมาสรุป', 'Number of raw readings rolled up')}</td></tr>
            <tr><td><code>name_th / name_en</code></td><td>text</td><td data-th="ชื่อสถานี" data-en="Station name">${tr('ชื่อสถานี', 'Station name')}</td></tr>
            <tr><td><code>province_th / province_en</code></td><td>text</td><td data-th="จังหวัด" data-en="Province">${tr('จังหวัด', 'Province')}</td></tr>
            <tr><td><code>lat / lng</code></td><td>real</td><td data-th="พิกัด" data-en="Coordinates">${tr('พิกัด', 'Coordinates')}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="rp-api-ref">
        <h3 data-th="API สำหรับนักพัฒนา" data-en="API for Developers">${tr('API สำหรับนักพัฒนา', 'API for Developers')}</h3>
        <pre><code>GET /api/export/full              → Full dataset CSV (permanent hourly)
GET /api/export/full?format=json  → Same as JSON
GET /api/export/daily?date=YYYY-MM-DD&format=csv → One day
GET /api/exports                  → List weekly archives
GET /api/exports/latest           → Newest weekly archive
GET /api/exports/&lt;filename&gt;     → Stream the .tar.gz
GET /api/series?source=X&station=Y&metric=Z&hours=72 → Time series
GET /api/stations?q=...           → Station search
GET /api/snapshot                  → Current live data
GET /api/sources                   → Source catalog</code></pre>
      </div>
    </section>`
}

function sectionFooter() {
  return `
    <div class="rp-footer">
      <p data-th="© 2026 ดร.นน อัครประเสริฐกุล — สงวนลิขสิทธิ์ จัดทำภายใต้สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) และสำนักงานเมืองอัจฉริยะประเทศไทย" data-en="© 2026 Dr Non Arkaraprasertkul — All rights reserved. Produced under depa and the Smart City Thailand Office.">
        ${tr(
          '© 2026 ดร.นน อัครประเสริฐกุล — สงวนลิขสิทธิ์ จัดทำภายใต้ depa และสำนักงานเมืองอัจฉริยะประเทศไทย',
          '© 2026 Dr Non Arkaraprasertkul — All rights reserved. Produced under depa and the Smart City Thailand Office.'
        )}
      </p>
    </div>`
}

// ── Render ──────────────────────────────────────────────────────────────────

let catalogCache = null
let rendered = false

async function loadCatalog() {
  if (catalogCache) return catalogCache
  try {
    catalogCache = await getJson('/api/sources', 300_000)
  } catch {
    catalogCache = null
  }
  return catalogCache
}

function paint() {
  const container = document.getElementById('research-content')
  if (!container) return
  const catalog = catalogCache
  const sections = [
    sectionHero(),
    sectionArchitecture(),
    sectionSources(catalog),
    sectionScore(),
    sectionCascade(),
    sectionApi(),
    sectionEnso(),
    sectionRetention(),
    sectionLimitations(),
    sectionCitations(),
    sectionDownload(),
    sectionFooter(),
  ]
  container.innerHTML = sections.join('')

  // Re-paint bilingual nodes
  for (const node of container.querySelectorAll('[data-th][data-en]')) {
    node.textContent = tr(node.dataset.th, node.dataset.en)
  }

  // Wire download button
  const dlBtn = document.getElementById('rp-download-full')
  if (dlBtn) {
    dlBtn.addEventListener('click', async () => {
      const meta = document.getElementById('rp-download-meta')
      if (meta) meta.textContent = tr('กำลังเตรียมข้อมูล…', 'Preparing dataset…')
      try {
        window.location.href = '/api/export/full'
        if (meta) meta.textContent = ''
      } catch {
        if (meta) meta.textContent = tr('ดาวน์โหลดล้มเหลว', 'Download failed')
      }
    })
  }

  // Wire weekly archive download. Fetches the list, shows what's
  // available with the size of each, and downloads the latest. The
  // /api/exports endpoint is public; the build endpoint (admin-only)
  // is intentionally not surfaced in the UI.
  const wkBtn = document.getElementById('rp-download-weekly')
  if (wkBtn) {
    wkBtn.addEventListener('click', async () => {
      const meta = document.getElementById('rp-download-weekly-meta')
      try {
        if (meta) meta.textContent = tr('กำลังตรวจสอบไฟล์…', 'Checking for the latest archive…')
        const r = await getJson('/api/exports', 5_000)
        if (!r.count) {
          if (meta) meta.textContent = tr('ยังไม่มีไฟล์ — รอการสร้างครั้งแรก (ทุกวันอาทิตย์ 02:00)',
                                          'No archive yet — wait for the first weekly build (Sundays 02:00).')
          return
        }
        const latest = r.exports[0]
        const sizeMb = (latest.size / 1024 / 1024).toFixed(1)
        if (meta) meta.textContent = `${tr('กำลังดาวน์โหลด', 'Downloading')} · ${latest.date} · ${sizeMb} MB`
        window.location.href = `/api/exports/${latest.filename}`
        setTimeout(() => { if (meta) meta.textContent = '' }, 5000)
      } catch (e) {
        if (meta) meta.textContent = tr('ดาวน์โหลดล้มเหลว', 'Download failed')
      }
    })
  }

  rendered = true
}

export async function initResearch() {
  // The About overlay tab switcher
  const overlay = document.getElementById('about-overlay')
  if (!overlay) return

  // Tab switching within About overlay
  const tabs = overlay.querySelectorAll('.about-tab')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.aboutPane
      tabs.forEach((t) => t.classList.toggle('active', t === tab))
      overlay.querySelectorAll('.about-pane').forEach((p) => {
        p.classList.toggle('active', p.dataset.aboutPane === target)
      })
      if (target === 'research' && !rendered) {
        loadCatalog().then(() => paint())
      } else if (target === 'research') {
        paint() // re-paint on lang switch
      }
    })
  })

  // "Read the research paper" link in About tab → switch to research tab
  const paperLink = document.getElementById('research-paper-link')
  if (paperLink) {
    paperLink.addEventListener('click', (e) => {
      e.preventDefault()
      const researchTab = overlay.querySelector('.about-tab[data-about-pane="research"]')
      if (researchTab) researchTab.click()
    })
  }

  // Re-paint on language change
  on('lang', () => {
    if (rendered) paint()
  })

  // Load catalog in background (non-blocking)
  loadCatalog()
}