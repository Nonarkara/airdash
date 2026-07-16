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
    { y: 36, label: 'AIR4', sub: 'PM2.5 · ~200 stn', color: 'var(--aqi)' },
    { y: 70, label: 'RAIN', sub: '~4,200 gauges', color: 'var(--rain)' },
    { y: 104, label: 'OMET', sub: 'weather fc', color: 'var(--band-watch)' },
    { y: 138, label: 'CAMS', sub: 'PM2.5 forecast', color: 'var(--aqi)' },
    { y: 172, label: 'IMERG', sub: 'satellite rain', color: 'var(--rain)' },
    { y: 206, label: 'ONI', sub: 'ENSO', color: 'var(--band-elevated)' },
    { y: 240, label: 'NEWS', sub: 'RSS ฝุ่น/หมอกควัน', color: 'var(--ink-mid)' },
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
  // PM2.5 40%
  svg += `<rect x="10" y="20" width="224" height="50" fill="var(--aqi)" opacity="0.15" stroke="var(--aqi)" stroke-width="1"/>`
  svg += `<text x="122" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="14" font-weight="700" fill="var(--aqi)">PM2.5 40%</text>`
  svg += `<text x="122" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">worst fresh station (3h)</text>`
  // Forecast 20%
  svg += `<rect x="242" y="20" width="116" height="50" fill="var(--band-elevated)" opacity="0.15" stroke="var(--band-elevated)" stroke-width="1"/>`
  svg += `<text x="300" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="13" font-weight="700" fill="var(--band-elevated)">FC 20%</text>`
  svg += `<text x="300" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-mid)">CAMS pm25 24/48h</text>`
  // Trend 15%
  svg += `<rect x="366" y="20" width="86" height="50" fill="var(--band-watch)" opacity="0.2" stroke="var(--band-watch)" stroke-width="1"/>`
  svg += `<text x="409" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="var(--band-elevated)">TREND 15%</text>`
  svg += `<text x="409" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">6h PM2.5 rise</text>`
  // Stagnation 15%
  svg += `<rect x="460" y="20" width="86" height="50" fill="var(--band-high)" opacity="0.15" stroke="var(--band-high)" stroke-width="1"/>`
  svg += `<text x="503" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="11" font-weight="700" fill="var(--band-high)">STAG 15%</text>`
  svg += `<text x="503" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="7.5" fill="var(--ink-mid)">wind + dry air</text>`
  // Pollutants 10%
  svg += `<rect x="554" y="20" width="40" height="50" fill="var(--ink-mid)" opacity="0.12" stroke="var(--ink-mid)" stroke-width="1"/>`
  svg += `<text x="574" y="42" text-anchor="middle" font-family="var(--font-num)" font-size="9" font-weight="700" fill="var(--ink-mid)">POL 10%</text>`
  svg += `<text x="574" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="7" fill="var(--ink-mid)">pm10·o3·no2</text>`
  // = sign
  svg += `<text x="300" y="90" text-anchor="middle" font-family="var(--font-num)" font-size="10.5" fill="var(--ink-mid)">score = 0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation → round(0–100)</text>`
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

function svgWashout() {
  const w = 760, h = 190
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  // Rain-relief steps: forecast mm → % of PM2.5 scrubbed out (wet deposition).
  const steps = [
    { x: 40,  label: '<1 mm',    relief: '0%',  c: 'var(--ink-low)' },
    { x: 190, label: '1–5 mm',   relief: '8%',  c: 'var(--rain)' },
    { x: 340, label: '5–15 mm',  relief: '20%', c: 'var(--rain)' },
    { x: 490, label: '15–35 mm', relief: '30%', c: 'var(--th-navy)' },
    { x: 640, label: '>35 mm',   relief: '40%', c: 'var(--th-navy)' },
  ]
  let prev = null
  for (const s of steps) {
    svg += `<rect x="${s.x}" y="40" width="100" height="46" fill="${s.c}" opacity="0.12" stroke="${s.c}" stroke-width="1.5"/>`
    svg += `<text x="${s.x + 50}" y="58" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="${s.c}">${s.label}</text>`
    svg += `<text x="${s.x + 50}" y="76" text-anchor="middle" font-family="var(--font-num)" font-size="13" font-weight="700" fill="var(--ink)">−${s.relief}</text>`
    if (prev !== null) {
      svg += `<line x1="${prev + 100}" y1="63" x2="${s.x}" y2="63" stroke="var(--ink-low)" stroke-width="1" marker-end="url(#arrWash)"/>`
    }
    prev = s.x
  }
  svg += `<text x="380" y="24" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--th-navy)">${'ฝนพยากรณ์ 24 ชม. → % PM2.5 ที่ถูกชะล้าง (wet deposition)'}</text>`
  svg += `<text x="380" y="120" text-anchor="middle" font-family="var(--font-num)" font-size="10" fill="var(--ink-mid)">expected_relief = relief × P(rain) · projected_pm25 = pm25 × (1 − relief/100)</text>`
  svg += `<text x="380" y="140" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-low)">band: strong ≥15mm ∧ prob ≥60% · moderate ≥5mm ∧ ≥40% · light ≥1mm ∧ ≥25% · else none</text>`
  svg += `<text x="380" y="160" text-anchor="middle" font-family="var(--font-num)" font-size="9" fill="var(--ink-low)">helps_dust = pm25 > 25 µg/m³ ∧ band ∈ {moderate, strong}</text>`
  svg += `<defs><marker id="arrWash" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="var(--ink-low)"/></marker></defs>`
  svg += `</svg>`
  return svg
}

function svgAqiBreakpoints() {
  const w = 600, h = 60
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="research-svg" xmlns="http://www.w3.org/2000/svg">`
  const segs = [
    { x: 10, w: 100, c: 'var(--band-normal)', label: '0–15', sub: 'ดีมาก' },
    { x: 110, w: 100, c: '#8BB174', label: '15–25', sub: 'ดี' },
    { x: 210, w: 120, c: 'var(--band-watch)', label: '25–37.5', sub: 'ปานกลาง' },
    { x: 330, w: 130, c: 'var(--band-elevated)', label: '37.5–75', sub: 'เริ่มมีผลต่อสุขภาพ' },
    { x: 460, w: 130, c: 'var(--band-high)', label: '≥75', sub: 'มีผลต่อสุขภาพ' },
  ]
  for (const s of segs) {
    svg += `<rect x="${s.x}" y="10" width="${s.w}" height="28" fill="${s.c}" opacity="0.25" stroke="${s.c}" stroke-width="1.5"/>`
    svg += `<text x="${s.x + s.w / 2}" y="26" text-anchor="middle" font-family="var(--font-num)" font-size="10" font-weight="700" fill="var(--ink)">${s.label}</text>`
    svg += `<text x="${s.x + s.w / 2}" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">${s.sub}</text>`
  }
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
  svg += `<text x="90" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">↑ washout rain</text>`
  // Neutral
  svg += `<rect x="180" y="15" width="140" height="50" fill="var(--ink-low)" opacity="0.12" stroke="var(--ink-low)" stroke-width="1.5"/>`
  svg += `<text x="250" y="35" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="var(--ink-mid)">NEUTRAL</text>`
  svg += `<text x="250" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">−0.5 < ONI < +0.5</text>`
  svg += `<text x="250" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-low)">baseline</text>`
  // El Niño
  svg += `<rect x="340" y="15" width="140" height="50" fill="#E86A10" opacity="0.12" stroke="#E86A10" stroke-width="1.5"/>`
  svg += `<text x="410" y="35" text-anchor="middle" font-family="var(--font-num)" font-size="12" font-weight="700" fill="#E86A10">EL NIÑO</text>`
  svg += `<text x="410" y="50" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">ONI ≥ +0.5</text>`
  svg += `<text x="410" y="60" text-anchor="middle" font-family="var(--font-num)" font-size="8" fill="var(--ink-mid)">drier → worse haze</text>`
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
      <h1 class="rp-hero-title" data-th="AirDash — ระบบเฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศเรียลไทม์โอเพนซอร์สสำหรับประเทศไทย" data-en="AirDash — A Real-Time, Open-Source Air Quality Watch for Thailand">
        ${tr('AirDash — ระบบเฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศเรียลไทม์โอเพนซอร์สสำหรับประเทศไทย', 'AirDash — A Real-Time, Open-Source Air Quality Watch for Thailand')}
      </h1>
      <div class="rp-hero-meta">
        <div><strong>Dr Non Arkaraprasertkul</strong> · ดร.นน อัครประเสริฐกุล</div>
        <div>Senior Expert, Smart City Promotion Department · depa</div>
        <div><code>non.ar@depa.or.th</code> · <a href="https://smartcitythailand.or.th" target="_blank" rel="noopener">smartcitythailand.or.th</a></div>
      </div>
      <div class="rp-abstract">
        <p data-th="AirDash เป็นระบบเฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศ 24/7 ที่ทำงานบนเครื่องเดียว เชื่อมข้อมูลเปิดจาก 7 แหล่ง (สถานีวัดคุณภาพอากาศ Air4Thai ~200 สถานี · ฝน ~4,200 สถานี · พยากรณ์อากาศรายจังหวัด · พยากรณ์ PM2.5 CAMS · ฝนดาวเทียม NASA GPM · ENSO · ข่าวฝุ่น/หมอกควัน) ผ่านแดชบอร์ดสองภาษา ข้อมูลทุกค่าถูกเก็บลง SQLite แล้วสรุปเป็นรายชั่วโมงถาวรหลัง 90 วัน ระบบแสดงดัชนีเฝ้าระวังรายจังหวัด (PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ 15%) และการวิเคราะห์ 'ฝนช่วยล้างฝุ่น' (rain washout) ที่บอกว่าฝนที่กำลังมาจะลดฝุ่นแต่ละพื้นที่ได้เท่าไร — ทั้งสองเป็น 'ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์'" data-en="AirDash is a 24/7 single-machine air-quality monitoring system for Thailand. It unifies seven open public data pipelines into a single bilingual dashboard. Every reading is persisted to SQLite; raw rows are rolled into hourly aggregates after 90 days. The system presents a province-level watch score (PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15%) and a first-class rain-washout analysis — the chance of precipitation and how much it would help the dust situation in each area. Both are explicitly framed as heuristic indicators, not forecasts.">
          ${tr(
            'AirDash เป็นระบบเฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศ 24/7 ที่ทำงานบนเครื่องเดียว เชื่อมข้อมูลเปิดจาก 7 แหล่ง (สถานีวัดคุณภาพอากาศ Air4Thai ~200 สถานี · ฝน ~4,200 สถานี · พยากรณ์อากาศรายจังหวัด · พยากรณ์ PM2.5 CAMS · ฝนดาวเทียม NASA GPM · ENSO · ข่าวฝุ่น/หมอกควัน) ผ่านแดชบอร์ดสองภาษา ข้อมูลทุกค่าถูกเก็บลง SQLite แล้วสรุปเป็นรายชั่วโมงถาวรหลัง 90 วัน ระบบแสดงดัชนีเฝ้าระวังรายจังหวัด (PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ 15%) และการวิเคราะห์ "ฝนช่วยล้างฝุ่น" ที่บอกว่าฝนที่กำลังมาจะลดฝุ่นแต่ละพื้นที่ได้เท่าไร — ทั้งสองเป็น "ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์"',
            'AirDash is a 24/7 single-machine air-quality monitoring system for Thailand. It unifies seven open public data pipelines into a single bilingual dashboard. Every reading is persisted to SQLite; raw rows are rolled into hourly aggregates after 90 days. The system presents a province-level watch score (PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15%) and a first-class rain-washout analysis — the chance of precipitation and how much it would help the dust situation in each area. Both are explicitly framed as heuristic indicators, not forecasts.'
          )}
        </p>
      </div>
    </div>`
}

function sectionWhy() {
  // Section 1 — Why AirDash exists. The academic framing of the same
  // personal story that lives in the About pane's "Why this is personal"
  // block. Kept here as the paper's Introduction so the methodology
  // that follows is anchored in the design contract.
  return `
    <section class="rp-section rp-section-why">
      <h2 data-th="1. ทำไมจึงเกิด AirDash — บทนำ" data-en="1. Why AirDash Exists — Introduction">
        ${tr('1. ทำไมจึงเกิด AirDash — บทนำ', '1. Why AirDash Exists — Introduction')}
      </h2>

      <blockquote class="rp-blockquote">
        <p data-th="ถ้าหายใจไม่ออก แล้วจะทำอะไรได้" data-en="If you can't breathe, what else can you do?">
          ${tr('ถ้าหายใจไม่ออก แล้วจะทำอะไรได้', 'If you can\'t breathe, what else can you do?')}
        </p>
      </blockquote>

      <p data-th="AirDash เกิดจากความสูญเสียส่วนตัว — บิดาของผู้เขียนสูบบุหรี่ตอนหนุ่ม และมีปัญหาปอดตั้งแต่เด็ก ในยุคที่การแพทย์ยังไม่ก้าวหน้า ท่านอยู่กับอากาศที่ไม่ดีในกรุงเทพฯ ตลอดช่วงชีวิตทำงาน ท่านเสียชีวิตก่อนวัยอันควรในช่วงต้นของวัยหกสิบ เพื่อนร่วมงานและเพื่อนฝูงหลายคนก็เจ็บป่วยหนักหรือเสียชีวิตด้วยปัญหาที่เริ่มต้นจากคุณภาพอากาศที่แย่ ผู้เขียนเศร้าทุกครั้งที่เห็นข่าวคนที่ไม่เคยสูบบุหรี่เสียชีวิตเพราะฝุ่น" data-en="AirDash was born from a personal loss. The author's father smoked when he was young, and had lung problems from a young age — in an era when medicine wasn't advanced. He lived with bad air in Bangkok his entire working life. He passed away prematurely, in his early sixties. Many of his friends and colleagues also fell seriously ill, or died, from problems that started with bad air quality. The author was saddened every time he saw news of someone who never smoked dying from the particles.">
        ${tr(
          'AirDash เกิดจากความสูญเสียส่วนตัว — บิดาของผู้เขียนสูบบุหรี่ตอนหนุ่ม และมีปัญหาปอดตั้งแต่เด็ก ในยุคที่การแพทย์ยังไม่ก้าวหน้า ท่านอยู่กับอากาศที่ไม่ดีในกรุงเทพฯ ตลอดช่วงชีวิตทำงาน ท่านเสียชีวิตก่อนวัยอันควรในช่วงต้นของวัยหกสิบ เพื่อนร่วมงานและเพื่อนฝูงหลายคนก็เจ็บป่วยหนักหรือเสียชีวิตด้วยปัญหาที่เริ่มต้นจากคุณภาพอากาศที่แย่ ผู้เขียนเศร้าทุกครั้งที่เห็นข่าวคนที่ไม่เคยสูบบุหรี่เสียชีวิตเพราะฝุ่น',
          'AirDash was born from a personal loss. The author\'s father smoked when he was young, and had lung problems from a young age — in an era when medicine wasn\'t advanced. He lived with bad air in Bangkok his entire working life. He passed away prematurely, in his early sixties. Many of his friends and colleagues also fell seriously ill, or died, from problems that started with bad air quality. The author was saddened every time he saw news of someone who never smoked dying from the particles.'
        )}
      </p>

      <figure class="rp-figure rp-figure--photo">
        <img src="/photos/Dad%20and%20me%201981.JPG" alt="Dad and me · 1981" loading="lazy">
        <figcaption data-th="ภาพที่ 1: ผู้เขียน (เด็ก) กับบิดา · 1981" data-en="Figure 1: The author (as a child) with his father · 1981">
          ${tr('ภาพที่ 1: ผู้เขียน (เด็ก) กับบิดา · 1981', 'Figure 1: The author (as a child) with his father · 1981')}
        </figcaption>
      </figure>

      <p data-th="ขณะที่ผู้เขียนอาศัยอยู่ในเซี่ยงไฮ้ตั้งแต่ปี 2013 ถึง 2016 ได้เกิดวิกฤตคุณภาพอากาศครั้งรุนแรงที่สุดในประวัติศาสตร์เมือง เมื่อ Shanghai Daily รายงานค่า PM2.5 เกิน 200 µg/m³ ในตัวเมือง ท้องฟ้าเต็มไปด้วยฝุ่นราวกับโลกกำลังจะแตก ประสบการณ์นี้ทำให้ผู้เขียนตระหนักว่าอากาศที่หายใจได้เป็นสิทธิขั้นพื้นฐานที่สุด — และถ้าหน่วยงานท้องถิ่น เช่น กรุงเทพมหานคร (BMA) ไม่ดำเนินการ ผู้อยู่อาศัยก็ต้องเสีย 2–3 ปีของอายุขัยโดยไม่จำเป็น" data-en="While the author was living in Shanghai from 2013 to 2016, the city experienced its worst air quality crisis in history — Shanghai Daily reported PM2.5 above 200 µg/m³ in the city centre, and the sky was so dusty it felt like the world was ending. This experience crystallised the author's belief that breathable air is the most basic of rights — and that when local authorities, like Bangkok Metropolitan Administration (BMA), fail to act, residents lose 2–3 years of life expectancy unnecessarily.">
        ${tr(
          'ขณะที่ผู้เขียนอาศัยอยู่ในเซี่ยงไฮ้ตั้งแต่ปี 2013 ถึง 2016 ได้เกิดวิกฤตคุณภาพอากาศครั้งรุนแรงที่สุดในประวัติศาสตร์เมือง เมื่อ Shanghai Daily รายงานค่า PM2.5 เกิน 200 µg/m³ ในตัวเมือง',
          'While the author was living in Shanghai from 2013 to 2016, the city experienced its worst air quality crisis in history — Shanghai Daily reported PM2.5 above 200 µg/m³ in the city centre.'
        )}
      </p>

      <figure class="rp-figure rp-figure--photo">
        <img src="/photos/From%20Dr%20Non%20Shanghai%20apartment%20window%20when%20red%20alert%20told%20people%20not%20to%20leabe%20home%20and%20close%20windows.JPG" alt="From Dr Non Shanghai apartment window when red alert told people not to leave home and close windows" loading="lazy">
        <figcaption data-th="ภาพที่ 2: มุมมองจากหน้าต่างห้องพักผู้เขียนในเซี่ยงไฮ้ ขณะเมืองประกาศ 'แดง' — ท้องฟ้าแบนราบ ไม่เห็นขอบฟ้า" data-en="Figure 2: View from the author's apartment in Shanghai during the city's 'red alert' — the sky is a flat grey, the skyline disappears into the haze.">
          ${tr('ภาพที่ 2: มุมมองจากหน้าต่างห้องพักผู้เขียนในเซี่ยงไฮ้ ขณะเมืองประกาศ "แดง" — ท้องฟ้าแบนราบ ไม่เห็นขอบฟ้า', 'Figure 2: View from the author\'s apartment in Shanghai during the city\'s "red alert" — the sky is a flat grey, the skyline disappears into the haze.')}
        </figcaption>
      </figure>

      <p data-th="ดังนั้นระบบนี้จึงถูกสร้างขึ้นบนสถาปัตยกรรมเดียวกับ FloodDash (flood.nonarkara.org) แต่ออกแบบใหม่ให้ดูดีกว่า เพราะถ้าเครื่องมือนี้ดูไม่น่าเชื่อถือ คนก็จะไม่ใช้ และถ้าไม่มีใครใช้ ข้อมูลก็ไม่มีความหมาย" data-en="The system is therefore built on the same architecture as FloodDash (flood.nonarkara.org) — but redesigned to be more stylish. Because if the tool doesn't look credible, people won't use it. And if nobody uses it, the data has no meaning.">
        ${tr(
          'ดังนั้นระบบนี้จึงถูกสร้างขึ้นบนสถาปัตยกรรมเดียวกับ FloodDash (flood.nonarkara.org) แต่ออกแบบใหม่ให้ดูดีกว่า เพราะถ้าเครื่องมือนี้ดูไม่น่าเชื่อถือ คนก็จะไม่ใช้',
          'The system is therefore built on the same architecture as FloodDash (flood.nonarkara.org) — but redesigned to be more stylish. Because if the tool doesn\'t look credible, people won\'t use it.'
        )}
      </p>

      <div class="rp-design-contract">
        <div class="rp-contract-head" data-th="สัญญาการออกแบบ · 3 ข้อ" data-en="THE DESIGN CONTRACT · THREE COMMITMENTS">
          ${tr('สัญญาการออกแบบ · 3 ข้อ', 'The Design Contract · Three Commitments')}
        </div>
        <ol class="rp-contract-list">
          <li>
            <div class="rp-contract-num">01</div>
            <div class="rp-contract-body">
              <div class="rp-contract-title" data-th="ลงมือทำเอง" data-en="TAKING IT INTO MY OWN HANDS">${tr('ลงมือทำเอง', 'TAKING IT INTO MY OWN HANDS')}</div>
              <p data-th="นักการเมืองและรัฐบาลช้าเกินไป และชีวิตของเราถูกเกินไปสำหรับพวกเขาที่จะสนใจ — ผมจะลองด้วยวิธีที่ถูกที่สุดและได้ผลที่สุด: ระบบดิจิทัล" data-en="Politicians and governments are too slow, and our lives are too cheap for them to consider. I'll try the cheapest and most effective way: a digital system.">
                ${tr('นักการเมืองและรัฐบาลช้าเกินไป และชีวิตของเราถูกเกินไปสำหรับพวกเขาที่จะสนใจ — ผมจะลองด้วยวิธีที่ถูกที่สุดและได้ผลที่สุด: ระบบดิจิทัล', 'Politicians and governments are too slow, and our lives are too cheap for them to consider. I\'ll try the cheapest and most effective way: a digital system.')}
              </p>
            </div>
          </li>
          <li>
            <div class="rp-contract-num">02</div>
            <div class="rp-contract-body">
              <div class="rp-contract-title" data-th="อากาศเป็นสิทธิขั้นพื้นฐาน" data-en="AIR IS A BASIC RIGHT">${tr('อากาศเป็นสิทธิขั้นพื้นฐาน', 'AIR IS A BASIC RIGHT')}</div>
              <p data-th="เราต้องปกป้องมัน และข้อมูลนี้จะพิสูจน์ทุกอย่างที่เราต้องการจะพิสูจน์" data-en="We have to protect it. And this data will prove everything we need to prove.">
                ${tr('เราต้องปกป้องมัน และข้อมูลนี้จะพิสูจน์ทุกอย่างที่เราต้องการจะพิสูจน์', 'We have to protect it. And this data will prove everything we need to prove.')}
              </p>
            </div>
          </li>
          <li>
            <div class="rp-contract-num">03</div>
            <div class="rp-contract-body">
              <div class="rp-contract-title" data-th="เร่งด่วนกว่าโลกร้อน — คุณตายได้" data-en="MORE IMMEDIATE THAN GLOBAL WARMING — YOU CAN DIE">${tr('เร่งด่วนกว่าโลกร้อน — คุณตายได้', 'MORE IMMEDIATE THAN GLOBAL WARMING — YOU CAN DIE')}</div>
              <p data-th="เราควรจะเดินทางและทำสิ่งต่าง ๆ โดยสร้างปัญหาให้ปอดน้อยลง — เรื่องนี้เร่งด่วนกว่าโลกร้อนเสียอีก เพราะคุณตายได้" data-en="We should be able to travel and do things while creating fewer problems for our lungs — this is more immediate than global warming. You can die.">
                ${tr('เราควรจะเดินทางและทำสิ่งต่าง ๆ โดยสร้างปัญหาให้ปอดน้อยลง — เรื่องนี้เร่งด่วนกว่าโลกร้อนเสียอีก เพราะคุณตายได้', 'We should be able to travel and do things while creating fewer problems for our lungs — this is more immediate than global warming. You can die.')}
              </p>
            </div>
          </li>
        </ol>
        <p class="rp-contract-closing" data-th="นี่คือเรื่องส่วนตัว ผมอยากพิสูจน์ว่าคนเพียงหนึ่งคนสามารถแก้ปัญหาที่รัฐบาลทำไม่ได้" data-en="This is personal. I want to prove that one person can solve a problem an administration cannot.">
          ${tr('นี่คือเรื่องส่วนตัว ผมอยากพิสูจน์ว่าคนเพียงหนึ่งคนสามารถแก้ปัญหาที่รัฐบาลทำไม่ได้', 'This is personal. I want to prove that one person can solve a problem an administration cannot.')}
        </p>
      </div>
    </section>`
}

function sectionArchitecture() {
  return `
    <section class="rp-section">
      <h2 data-th="2. สถาปัตยกรรมระบบ" data-en="2. System Architecture">${tr('2. สถาปัตยกรรมระบบ', '2. System Architecture')}</h2>
      <div class="rp-figure">${svgArchitecture()}</div>
      <p data-th="ดีไซน์รวมทุกอย่างในโปรเซสเดียว — รันบน Raspberry Pi หรือแล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ เหตุการณ์ทุกอย่างผ่านบัสเดียวและถูกเขียนลงตาราง events ทำให้ท่อข้อมูลสดเป็นล็อกที่ query ได้ RAG ที่ใช้ LLM local เป็นทางเลือก ถ้าไม่มีโมเดล แชทบอทจะถอยไปแสดงสรุปข้อมูลจริงแบบมีโครงสร้าง" data-en="The single-process design means the system runs on a Raspberry Pi or a retired office laptop, the database is a single file, and the entire surface is auditable. All events go through one bus and are written to an events table so the running tap is also a queryable log. The local-LLM RAG is optional: with no model, the chatbot gracefully degrades to a structured live-data summary.">
        ${tr(
          'ดีไซน์รวมทุกอย่างในโปรเซสเดียว — รันบน Raspberry Pi หรือแล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ เหตุการณ์ทุกอย่างผ่านบัสเดียวและถูกเขียนลงตาราง events ทำให้ท่อข้อมูลสดเป็นล็อกที่ query ได้ RAG ที่ใช้ LLM local เป็นทางเลือก ถ้าไม่มีโมเดล แชทบอทจะถอยไปแสดงสรุปข้อมูลจริงแบบมีโครงสร้าง',
          'The single-process design means the system runs on a Raspberry Pi or a retired office laptop, the database is a single file, and the entire surface is auditable. All events go through one bus and are written to an events table so the running tap is also a queryable log. The local-LLM RAG is optional: with no model, the chatbot gracefully degrades to a structured live-data summary.'
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
      <h2 data-th="3. แหล่งข้อมูล — ท่อสาธารณะ" data-en="3. Data Sources — Public Pipelines">${tr('3. แหล่งข้อมูล — ท่อสาธารณะ', '3. Data Sources — Public Pipelines')}</h2>
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
      <p data-th="น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองคุณภาพอากาศที่ปรับเทียบแล้ว PM2.5 จากสถานีภาคพื้นเป็นสัญญาณหลัก (40%) เพราะเป็นค่าที่กระทบสุขภาพโดยตรง พยากรณ์ CAMS ได้ 20% เพราะบอกว่าพรุ่งนี้จะแย่ลงหรือดีขึ้น แนวโน้ม 6 ชม. (15%) จับการสะสมฝุ่นที่กำลังเกิด การระบายอากาศ (15%) เป็นตัวแทนสภาพอากาศปิด — ลมอ่อน + ไม่มีฝน = ฝุ่นสะสม และมลพิษอื่น (PM10 · O₃ · NO₂ · SO₂ · CO, 10%) กันกรณีที่ฝุ่นละเอียดต่ำแต่มลพิษตัวอื่นสูง คะแนนนี้เป็นดัชนีเฝ้าระวังจากข้อมูลจริง ไม่ใช่การพยากรณ์คุณภาพอากาศ" data-en="The weights are a deliberate operational choice, not a calibrated air-quality model. Ground PM2.5 dominates (40%) because it is the direct health signal. The CAMS forecast gets 20% because it says whether tomorrow improves or worsens. The 6-hour trend (15%) catches accumulation as it happens. Ventilation (15%) proxies stagnant conditions — weak wind plus no rain means dust loads up. Other pollutants (PM10 · O₃ · NO₂ · SO₂ · CO, 10%) catch episodes where fine dust is low but another pollutant spikes. The score is a live watch indicator, not an air-quality forecast.">
        ${tr(
          'น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองคุณภาพอากาศที่ปรับเทียบแล้ว PM2.5 จากสถานีภาคพื้นเป็นสัญญาณหลัก (40%) เพราะเป็นค่าที่กระทบสุขภาพโดยตรง พยากรณ์ CAMS ได้ 20% แนวโน้ม 6 ชม. (15%) จับการสะสมฝุ่นที่กำลังเกิด การระบายอากาศ (15%) เป็นตัวแทนสภาพอากาศปิด และมลพิษอื่น (10%) กันกรณีมลพิษตัวอื่นสูง คะแนนนี้เป็นดัชนีเฝ้าระวังจากข้อมูลจริง ไม่ใช่การพยากรณ์คุณภาพอากาศ',
          'The weights are a deliberate operational choice, not a calibrated air-quality model. Ground PM2.5 dominates (40%) because it is the direct health signal. The CAMS forecast gets 20%, the 6-hour trend (15%) catches accumulation as it happens, ventilation (15%) proxies stagnant conditions, and other pollutants (10%) catch non-PM2.5 spikes. The score is a live watch indicator, not an air-quality forecast.'
        )}
      </p>
      <div class="rp-figure">${svgAqiBreakpoints()}</div>
      <p class="rp-lead" data-th="จุดตัด PM2.5 ตามเกณฑ์ AQI ไทย พ.ศ. 2566: 15 / 25 / 37.5 / 75 µg/m³ (เฉลี่ย 24 ชม.)" data-en="PM2.5 anchors follow the Thai AQI 2023 breakpoints: 15 / 25 / 37.5 / 75 µg/m³ (24-h mean).">
        ${tr('จุดตัด PM2.5 ตามเกณฑ์ AQI ไทย พ.ศ. 2566: 15 / 25 / 37.5 / 75 µg/m³', 'PM2.5 anchors follow the Thai AQI 2023 breakpoints: 15 / 25 / 37.5 / 75 µg/m³.')}
      </p>
    </section>`
}

function sectionWashout() {
  return `
    <section class="rp-section">
      <h2 data-th="5. ฝนช่วยล้างฝุ่น (Rain Washout)" data-en="5. Rain Washout — the Signature Analysis">${tr('5. ฝนช่วยล้างฝุ่น (Rain Washout)', '5. Rain Washout — the Signature Analysis')}</h2>
      <div class="rp-figure">${svgWashout()}</div>
      <p data-th="ฝนชะล้างอนุภาคในอากาศ (wet deposition / scavenging): เม็ดฝนจับฝุ่นละเอียดแล้วพาลงพื้น ระบบแปลงฝนพยากรณ์ 24 ชม. เป็น % ฝุ่นที่คาดว่าจะถูกชะล้าง แล้วถ่วงด้วยโอกาสเกิดฝน ได้ทั้ง 'ถ้าฝนตกจริงช่วยได้เท่าไร' และ 'คาดหวังได้เท่าไรเมื่อคิดความน่าจะเป็น' ต่อจังหวัด — นี่คือคำตอบของคำถามประจำฤดูฝุ่น: ฝนที่กำลังมาจะช่วยพื้นที่ไหนบ้าง" data-en="Rain scavenges airborne particles (wet deposition): droplets capture fine dust and carry it to the ground. The system converts the 24-h rain forecast into an expected PM2.5 relief percentage, then weights it by the probability of rain — giving both 'how much it helps if it lands' and the probability-weighted expectation per province. This answers the dust-season question: which areas will the incoming rain actually help?">
        ${tr(
          'ฝนชะล้างอนุภาคในอากาศ (wet deposition / scavenging): เม็ดฝนจับฝุ่นละเอียดแล้วพาลงพื้น ระบบแปลงฝนพยากรณ์ 24 ชม. เป็น % ฝุ่นที่คาดว่าจะถูกชะล้าง แล้วถ่วงด้วยโอกาสเกิดฝน — นี่คือคำตอบของคำถามประจำฤดูฝุ่น: ฝนที่กำลังมาจะช่วยพื้นที่ไหนบ้าง',
          'Rain scavenges airborne particles (wet deposition): droplets capture fine dust and carry it to the ground. The system converts the 24-h rain forecast into an expected PM2.5 relief percentage, weighted by rain probability — answering the dust-season question: which areas will the incoming rain actually help?'
        )}
      </p>
    </section>`
}

function sectionEnso() {
  return `
    <section class="rp-section">
      <h2 data-th="6. ENSO เป็นตัวปรับความเสี่ยง (ไม่ใช่ตัวพยากรณ์)" data-en="6. ENSO as a Risk Modulator">${tr('6. ENSO เป็นตัวปรับความเสี่ยง', '6. ENSO as a Risk Modulator')}</h2>
      <div class="rp-figure">${svgEnso()}</div>
      <p data-th="Oceanic Niño Index ดึงทุก 12 ชม. เอลนีโญทำให้แล้งและร้อนกว่าปกติ — ฤดูเผา/ฝุ่นมักรุนแรงขึ้นเพราะฝนที่ช่วยล้างฝุ่นมาน้อย ส่วนลานีญาเพิ่มโอกาสฝนล้างฝุ่น แต่นี่คือปัจจัยก่อนเหตุ ไม่ใช่ตัวพยากรณ์" data-en="The Oceanic Niño Index is fetched every 12 hours. El Niño brings drier, hotter conditions — burning/dust seasons tend to be worse because washout rain is scarce; La Niña raises washout-rain odds. This is a prior, not a predictor.">
        ${tr(
          'Oceanic Niño Index ดึงทุก 12 ชม. เอลนีโญทำให้แล้งและร้อนกว่าปกติ — ฤดูเผา/ฝุ่นมักรุนแรงขึ้นเพราะฝนที่ช่วยล้างฝุ่นมาน้อย ส่วนลานีญาเพิ่มโอกาสฝนล้างฝุ่น',
          'The Oceanic Niño Index is fetched every 12 hours. El Niño brings drier, hotter conditions — burning/dust seasons tend to be worse because washout rain is scarce; La Niña raises washout-rain odds.'
        )}
      </p>
    </section>`
}

function sectionRetention() {
  return `
    <section class="rp-section">
      <h2 data-th="7. การเก็บข้อมูลระยะยาว" data-en="7. Data Retention & Storage">${tr('7. การเก็บข้อมูลระยะยาว', '7. Data Retention & Storage')}</h2>
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
    { th: 'คะแนนเฝ้าระวังเป็นตัวบ่งชี้เชิงประเมิน ไม่ใช่การพยากรณ์คุณภาพอากาศ', en: 'The watch score is a heuristic indicator, not an air-quality forecast.' },
    { th: 'สัดส่วนฝนล้างฝุ่นเป็นค่าประมาณอันดับหนึ่งจากงานวิจัย wet deposition ไม่ได้ปรับเทียบรายพื้นที่', en: 'The washout relief ratios are first-order estimates from wet-deposition literature, not locally calibrated.' },
    { th: 'พยากรณ์ CAMS เป็น grid ระดับภูมิภาค อาจพลาดหุบเขาปิดหรือแหล่งกำเนิดเฉพาะจุด (โรงโม่ ไฟป่าใหม่)', en: 'The CAMS forecast is a regional grid — it can miss enclosed valleys or point sources (quarries, fresh fires).' },
    { th: 'สถานีวัดกระจุกตัวในเมือง อำเภอรอบนอกอาจไม่มีสถานีในรัศมีหลายสิบกิโลเมตร', en: 'Ground stations cluster in cities; outlying districts can be tens of kilometres from the nearest monitor.' },
    { th: 'ENSO เป็นบริบทตามฤดูกาล ไม่ใช่ตัวพยากรณ์ระยะสั้น', en: 'The ENSO chip is seasonal context, not a short-term predictor.' },
    { th: 'ข่าว RSS กรองด้วยคำค้น (ฝุ่น PM2.5 หมอกควัน ไฟป่า การเผา) ไม่ใช่ข่าวท้องถิ่นครบถ้วน', en: 'The news RSS is keyword-filtered (dust, PM2.5, haze, wildfire, burning) and not a substitute for local news.' },
    { th: 'แชทบอทตอบจากข้อมูลใน SQLite และไฟล์ความรู้เท่านั้น ไม่เห็นสิ่งที่หน่วยงานไม่เผยแพร่', en: 'The chatbot is grounded in SQLite numbers and knowledge files; it cannot see what agencies do not publish.' },
  ]
  const list = items.map((it) => `<li>${tr(it.th, it.en)}</li>`).join('')
  return `
    <section class="rp-section">
      <h2 data-th="8. ข้อจำกัดที่ต้องพูดตรง ๆ" data-en="8. Honest Limitations">${tr('8. ข้อจำกัดที่ต้องพูดตรง ๆ', '8. Honest Limitations')}</h2>
      <ul class="rp-limitations">${list}</ul>
      <div class="rp-warning" data-th="ฟังประกาศทางการของ คพ. / กรมอุตุฯ / กรมควบคุมโรค เสมอ ระบบนี้จัดทำเพื่อจัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย" data-en="Always follow official PCD / TMD / DDC guidance. This system is for prioritisation, not for issuing alerts.">
        ⚠ ${tr('ฟังประกาศทางการของ คพ. / กรมอุตุฯ / กรมควบคุมโรค เสมอ — ระบบนี้จัดทำเพื่อจัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย', 'Always follow official PCD / TMD / DDC guidance — this system is for prioritisation, not for issuing alerts.')}
      </div>
    </section>`
}

function sectionCitations() {
  const cites = [
    'Seinfeld, J. H. & Pandis, S. N. (2016). Atmospheric Chemistry and Physics: From Air Pollution to Climate Change. 3rd ed., Wiley. (wet deposition / scavenging)',
    'Guo, L. et al. (2016). Removal of atmospheric fine particles by rain: below-cloud scavenging. Atmos. Chem. Phys. 16.',
    'Pollution Control Department (2023). Thai AQI revision — PM2.5 breakpoints 15/25/37.5/75 µg/m³.',
    'WHO (2021). Global Air Quality Guidelines: PM2.5 and PM10.',
    'Copernicus CAMS air-quality forecast via Open-Meteo: open-meteo.com/en/docs/air-quality-api',
    'NOAA CPC — Oceanic Niño Index: cpc.ncep.noaa.gov/data/indices/oni.ascii.txt',
    'Pollution Control Department (PCD) Air4Thai: air4thai.pcd.go.th',
    'Hydro-Informatics Institute (HII) ThaiWater rain telemetry: thaiwater.net',
    'NASA GPM IMERG precipitation: gpm.nasa.gov/data/imerg',
    'Smart City Thailand Office: smartcitythailand.or.th',
    'JAXA GSMaP / Himawari: earth.jaxa.jp · eorc.jaxa.jp/ptree',
    'NASA GIBS: gibs.earthdata.nasa.gov',
  ]
  const list = cites.map((c) => `<li>${c}</li>`).join('')
  return `
    <section class="rp-section">
      <h2 data-th="9. อ้างอิงและเอกสารที่เกี่ยวข้อง" data-en="9. Citations & References">${tr('9. อ้างอิงและเอกสารที่เกี่ยวข้อง', '9. Citations & References')}</h2>
      <ul class="rp-citations">${list}</ul>
    </section>`
}

function sectionDownload() {
  return `
    <section class="rp-section rp-download-section">
      <h2 data-th="ดาวน์โหลดชุดข้อมูล" data-en="Download the Dataset">${tr('ดาวน์โหลดชุดข้อมูล', 'Download the Dataset')}</h2>
      <p class="rp-lead" data-th="ข้อมูลทุกค่าที่ AirDash เก็บถาวร (hourly aggregates) พร้อมข้อมูล metadata ของสถานี สามารถดาวน์โหลดเป็น CSV เพื่อวิเคราะห์ต่อได้ทันที" data-en="Every permanent hourly aggregate AirDash has stored, with full station metadata, downloadable as CSV for offline analysis.">
        ${tr(
          'ข้อมูลทุกค่าที่ AirDash เก็บถาวร พร้อม metadata ของสถานี ดาวน์โหลดเป็น CSV ได้ทันที',
          'Every permanent hourly aggregate AirDash has stored, with full station metadata, downloadable as CSV.'
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
            <tr><td><code>source</code></td><td>text</td><td data-th="รหัสแหล่งข้อมูล (air4thai, thaiwater_rain, ฯลฯ)" data-en="Source ID (air4thai, thaiwater_rain, etc.)">${tr('รหัสแหล่งข้อมูล', 'Source ID')}</td></tr>
            <tr><td><code>station_key</code></td><td>text</td><td data-th="รหัสสถานี" data-en="Station identifier">${tr('รหัสสถานี', 'Station identifier')}</td></tr>
            <tr><td><code>metric</code></td><td>text</td><td data-th="ตัวชี้วัด (pm25, pm10, o3, aqi, rain_24h, ฯลฯ)" data-en="Metric name (pm25, pm10, o3, aqi, rain_24h, etc.)">${tr('ตัวชี้วัด', 'Metric name')}</td></tr>
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
GET /api/washout                   → Rain-washout outlook per province
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
    sectionWhy(),
    sectionArchitecture(),
    sectionSources(catalog),
    sectionScore(),
    sectionWashout(),
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
