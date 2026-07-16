// National analytics panel — the one-screen operator view.
// Three KPI cards · three top-5 lists · one 14-day PM2.5 bar chart · one
// rain (washout) chart · one regional donut. Same shape as the GISTDA
// สรุปสถานการณ์ panel but pulled from our richer pipeline (real-time PM2.5,
// rain, forecast, washout) and bilingual.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr } from '../i18n.js?v=2.0.0-final'
import { fmtNum } from '../fmt.js?v=2.0.0-final'
import { getJson } from '../cache.js?v=2.0.0-final'
import { drawBarChart, drawDonut } from '../chart.js?v=2.0.0-final'

const BAND_LABEL_TH = {
  normal: 'ปกติ', watch: 'เฝ้าระวัง', elevated: 'เสี่ยงสูง', high: 'วิกฤต',
}
const BAND_LABEL_EN = {
  normal: 'Normal', watch: 'Watch', elevated: 'Elevated', high: 'Critical',
}

let lastDaily = null
let lastDailyFetch = 0
const DAILY_TTL = 5 * 60_000   // 5-min cache; trend is daily granularity

export function initAnalytics() {
  // Initial render once the first snapshot lands.
  on('snapshot', () => render(store.snapshot))
  on('lang',     () => render(store.snapshot))
}

async function ensureDaily() {
  const fresh = lastDaily && (Date.now() - lastDailyFetch < DAILY_TTL)
  if (fresh) return lastDaily
  try {
    lastDaily = await getJson('/api/series/daily?days=14', DAILY_TTL)
    lastDailyFetch = Date.now()
    return lastDaily
  } catch {
    return lastDaily ?? { days: 14, pm25: [], unhealthy: [], rain: [] }
  }
}

function bandColor(band) {
  return { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#A51931' }[band] || '#948C7F'
}

function topN(provs, key, n = 5, asc = false) {
  const sorted = [...provs]
    .filter((p) => Number.isFinite(p[key]))
    .sort((a, b) => asc ? a[key] - b[key] : b[key] - a[key])
  return sorted.slice(0, n)
}

async function render(snap) {
  const host = document.getElementById('analytics')
  if (!host || !snap?.risk?.provinces) return

  const provs = snap.risk.provinces.filter((p) => p.province_code !== '99')  // strip boundary spillover
  const n = snap.risk.national ?? {}
  const isEn = store.lang === 'en'
  const L = (th, en) => isEn ? en : th

  // ── National aggregates ────────────────────────────────────────────
  const avgRisk = provs.length ? provs.reduce((s, p) => s + (p.score ?? 0), 0) / provs.length : 0
  const elevatedCount = provs.filter((p) => p.band === 'elevated' || p.band === 'high').length
  const dustLoadPct = n.dustLoadPct ?? 0
  const dustyCount = n.dustyProvinceCount ?? 0
  const dustSampled = n.dustSampledCount ?? provs.length
  const worst = n.worstPm25 ?? null

  // ── Top-5 lists ─────────────────────────────────────────────────────
  const topRisk = topN(provs, 'score', 5)
  const topPm   = topN(provs, 'pm25', 5)
  const topRain = topN(provs, 'rain_obs_24h', 5)
  const regionalDist = regionDist(provs)

  // ── 14-day daily aggregates ────────────────────────────────────────
  const daily = await ensureDaily()
  const pmSeries = (daily?.pm25 ?? [])
    .map((r) => ({
      label: r.date?.slice(5) ?? '',  // MM-DD
      value: r.max_ug ?? 0,
      avg: r.avg_ug ?? 0,
    }))
    .reverse()  // oldest → newest, with the most recent bar in alt color
  const rainSeries = (daily?.rain ?? [])
    .map((r) => ({
      label: r.date?.slice(5) ?? '',
      value: r.max_mm ?? 0,
    }))
    .reverse()
  const unhealthyToday = (daily?.unhealthy ?? [])[0] ?? null
  const maxPmDaily = pmSeries.length ? Math.max(...pmSeries.map((r) => r.value)) : 0
  const maxRainDaily = rainSeries.length ? Math.max(...rainSeries.map((r) => r.value)) : 0

  // ── Render host ────────────────────────────────────────────────────
  host.replaceChildren(
    headerRow(snap, L),

    kpiRow([
      { th: 'คะแนนเฉลี่ยทั้งประเทศ', en: 'NATIONAL AVG RISK',
        value: fmtNum(avgRisk, 0) + '/100',
        sub: L(`${elevatedCount} จังหวัด ≥ เสี่ยงสูง`, `${elevatedCount} provinces at elevated+`),
        color: bandColor(avgRisk < 20 ? 'normal' : avgRisk < 45 ? 'watch' : avgRisk < 70 ? 'elevated' : 'high') },
      { th: 'จังหวัดฝุ่นเกินเกณฑ์', en: 'DUST LOAD',
        value: dustLoadPct + '%',
        sub: L(`${dustyCount} / ${dustSampled} จังหวัด ≥ 25 µg/m³`, `${dustyCount} / ${dustSampled} provinces ≥ 25 µg/m³`),
        color: '#5C6BC0' },
      { th: 'PM2.5 สูงสุดตอนนี้', en: 'WORST PM2.5 NOW',
        value: worst?.ug != null ? fmtNum(worst.ug, 0) + ' µg' : '—',
        sub: worst ? L(worst.province_th ?? '', worst.province_en ?? worst.province_th ?? '') : L('ไม่มีข้อมูล', 'no data'),
        color: '#A51931' },
    ]),

    listsRow(topRisk, topPm, topRain, L),

    chartRow(pmSeries, unhealthyToday, L),

    rainChartRow(rainSeries, L),

    donutRow(regionalDist, L),

    footerRow(provs.length, L),
  )

  // Paint charts after DOM commit so clientWidth/Height are correct.
  requestAnimationFrame(() => {
    const bar = host.querySelector('#ana-bar')
    if (bar) drawBarChart(bar, pmSeries, {
      color: '#241E4E', altColor: '#A51931', valueLabel: true, yMax: Math.max(maxPmDaily * 1.1, 50),
    })

    const rainBar = host.querySelector('#ana-rain')
    if (rainBar) drawBarChart(rainBar, rainSeries, {
      color: '#0039A6', altColor: '#E86A10', valueLabel: true, yMax: Math.max(maxRainDaily * 1.1, 50),
    })

    const donut = host.querySelector('#ana-donut')
    if (donut) drawDonut(donut, regionalDist, { showCenter: true })
  })
}

function regionDist(provs) {
  const order = [
    { key: 'ภาคเหนือ',           en: 'North',         color: '#241E4E' },
    { key: 'ภาคกลาง',           en: 'Central',       color: '#A51931' },
    { key: 'ภาคตะวันออกเฉียงเหนือ', en: 'Northeast',   color: '#E86A10' },
    { key: 'ภาคใต้',             en: 'South',         color: '#F0B400' },
    { key: 'กรุงเทพมหานคร',     en: 'Bangkok',       color: '#00933C' },
  ]
  return order.map((o) => {
    const regionProvs = provs.filter((p) => p.region_th === o.key || p.region_en === o.en)
    const scoreSum = regionProvs.reduce((s, p) => s + (p.score ?? 0), 0)
    return {
      label_th: o.key, label_en: o.en, color: o.color,
      value: scoreSum, count: regionProvs.length,
    }
  })
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v
    else if (k === 'html') n.innerHTML = v
    else if (k === 'style') n.setAttribute('style', v)
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v)
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue
    n.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return n
}

function headerRow(snap, L) {
  const now = snap.now ? new Date(snap.now) : new Date()
  const dateStr = now.toLocaleDateString(L('th-TH', 'en-US'),
    { day: 'numeric', month: 'short', year: 'numeric' })
  const v = snap.risk?.national_verdict
  return el('div', { class: 'ana-head' },
    el('div', { class: 'ana-eyebrow' }, L('สรุปสถานการณ์ฝุ่นประเทศไทย', 'THAILAND AIR QUALITY SITUATION')),
    el('div', { class: 'ana-sub' },
      L('ข้อมูลสด', 'Live') + ' · ' + dateStr),
    // Plain-language national one-liner — the "so what" for the whole country.
    v ? el('div', { class: `ana-verdict pv-${v.level}` }, L(v.th, v.en)) : null,
  )
}

function kpiRow(cards) {
  return el('div', { class: 'ana-kpis' },
    ...cards.map((c) => el('div', { class: 'ana-kpi' },
      el('div', { class: 'ana-kpi-label' }, c.th + ' · ' + c.en),
      el('div', { class: 'ana-kpi-value', style: `color:${c.color}` }, c.value),
      el('div', { class: 'ana-kpi-sub' }, c.sub),
    )),
  )
}

function listsRow(topRisk, topPm, topRain, L) {
  function row(p, idx, valueField, valueFmt) {
    const band = bandColor(p.band || 'normal')
    return el('div', { class: 'ana-list-row' },
      el('span', { class: 'ana-list-idx' }, String(idx + 1)),
      el('span', { class: 'ana-list-name' },
        L(p.province_th, p.province_en) || '—'),
      el('span', { class: 'ana-list-val', style: valueField === 'score' ? `color:${band}` : '' },
        valueFmt(p[valueField])),
    )
  }
  return el('div', { class: 'ana-lists' },
    el('div', { class: 'ana-list' },
      el('div', { class: 'ana-list-head' }, L('5 จังหวัดเสี่ยงสูงสุด', 'TOP 5 AT-RISK')),
      ...topRisk.map((p, i) => row(p, i, 'score', (v) => `${fmtNum(v, 0)}/100`)),
    ),
    el('div', { class: 'ana-list' },
      el('div', { class: 'ana-list-head' }, L('5 จังหวัดฝุ่นสูงสุด', 'TOP 5 PM2.5')),
      ...topPm.map((p, i) => row(p, i, 'pm25', (v) => `${fmtNum(v, 0)} µg`)),
    ),
    el('div', { class: 'ana-list' },
      el('div', { class: 'ana-list-head' }, L('5 จังหวัดฝนมาก (ช่วยล้างฝุ่น)', 'TOP 5 RAIN 24H (WASHOUT)')),
      ...topRain.map((p, i) => row(p, i, 'rain_obs_24h', (v) => `${fmtNum(v, 0)} มม.`)),
    ),
  )
}

function chartRow(pmSeries, unhealthyToday, L) {
  return el('div', { class: 'ana-card' },
    el('div', { class: 'ana-card-head' },
      el('div', { class: 'ana-card-title' }, L('PM2.5 สูงสุดรายวัน — 14 วัน', 'DAILY MAX PM2.5 — 14 DAYS')),
      el('div', { class: 'ana-card-sub' }, L('แท่งสีแดง = วันนี้', 'red bar = today')),
    ),
    el('canvas', { id: 'ana-bar', class: 'ana-bar' }),
    unhealthyToday
      ? el('div', { class: 'ana-meta' },
          L(`สถานีเกินเกณฑ์วันนี้: ${unhealthyToday.unhealthy ?? 0} แห่ง · อันตราย ${unhealthyToday.very_unhealthy ?? 0} แห่ง`,
            `Unhealthy stations today: ${unhealthyToday.unhealthy ?? 0} · very unhealthy ${unhealthyToday.very_unhealthy ?? 0}`))
      : null,
  )
}

function rainChartRow(rainSeries, L) {
  if (!rainSeries.length) return null
  return el('div', { class: 'ana-card' },
    el('div', { class: 'ana-card-head' },
      el('div', { class: 'ana-card-title' }, L('ฝน 24 ชม. สูงสุดรายวัน — บริบทฝนล้างฝุ่น', 'DAILY MAX RAIN — WASHOUT CONTEXT')),
      el('div', { class: 'ana-card-sub' }, L('ฝน ≥5 มม. เริ่มชะล้างฝุ่นได้', 'rain ≥5 mm starts scrubbing dust')),
    ),
    el('canvas', { id: 'ana-rain', class: 'ana-bar' }),
  )
}

function donutRow(slices, L) {
  return el('div', { class: 'ana-card ana-card-donut' },
    el('div', { class: 'ana-card-head' },
      el('div', { class: 'ana-card-title' },
        L('คะแนนเฝ้าระวังรวมตามภูมิภาค', 'TOTAL WATCH SCORE BY REGION')),
      el('div', { class: 'ana-card-sub' },
        L('วงกลม = ผลรวมคะแนน · ตัวเลขกลาง = คะแนนรวม',
          'donut = sum of scores · center = total score')),
    ),
    el('div', { class: 'ana-donut-wrap' },
      el('canvas', { id: 'ana-donut', class: 'ana-donut' }),
      el('div', { class: 'ana-donut-legend' },
        ...slices.map((s) => el('div', { class: 'ana-legend-row' },
          el('span', { class: 'sw', style: `background:${s.color}` }),
          el('span', { class: 'lbl' }, L(s.label_th, s.label_en)),
          el('span', { class: 'val' },
            `${fmtNum(s.value, 0)} ${L('คะแนน', 'pts')} · ${s.count} จ.`),
        )),
      ),
    ),
  )
}

function footerRow(provCount, L) {
  return el('div', { class: 'ana-foot' },
    el('div', { class: 'ana-foot-cell' },
      L('ข้อมูลสดจากแหล่งข้อมูลภาครัฐ · ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์',
        'Live from public pipelines · indicator, not a forecast')),
    el('div', { class: 'ana-foot-cell ana-foot-right' },
      L('ฟังประกาศ คพ. / กรมอุตุฯ เสมอ',
        'Always follow PCD / TMD'),
    ),
  )
}
