// Real-time insights panel — surfaces compound dust events, incoming
// washout rain, regional escalation, sudden score jumps, worsening
// forecasts, sensor gaps. Each card has a severity colour, a
// single-sentence title in both languages, and a body with the supporting
// numbers. Clicking flies the map to the relevant province.
import { on, store } from '../state.js?v=2.4.0'
import { tr, BAND } from '../i18n.js?v=2.4.0'
import { el, fmtNum } from '../fmt.js?v=2.4.0'
import { getJson } from '../cache.js?v=2.4.0'
import { flyToProvince } from '../map.js?v=2.4.0'
import { refreshSensorHealth } from '../sensorHealth.js?v=2.4.0'

const TYPE_LABEL = {
  compound:            { th: 'เหตุการณ์ซ้อน',        en: 'COMPOUND EVENT'      },
  washout_incoming:    { th: 'ฝนล้างฝุ่นกำลังมา',     en: 'WASHOUT INCOMING'    },
  regional_escalation: { th: 'ฝุ่นขยายทั้งภูมิภาค',   en: 'REGIONAL ESCALATION' },
  score_jump:          { th: 'คะแนนพุ่งขึ้นเร็ว',      en: 'SCORE JUMP'          },
  forecast_worsening:  { th: 'พยากรณ์แย่ลง 24-48 ชม.', en: 'FORECAST WORSENING'  },
  sensor_gap:          { th: 'สถานีเงียบ',             en: 'SENSOR GAP'          },
  data_quality:        { th: 'คุณภาพข้อมูล',           en: 'DATA QUALITY'        },
}

const SEV_LABEL = {
  critical: { th: 'วิกฤต', en: 'CRITICAL' },
  warn:     { th: 'เตือน', en: 'WARNING' },
  info:     { th: 'ข้อมูล', en: 'INFO'     },
}

let lastInsights = null

export function initInsights() {
  const box = document.getElementById('insights')
  if (!box) return
  refresh(box)
  refreshSensorHealth().catch(() => {})
  // Re-fetch on every snapshot tick — but at most every 30s to avoid hammering
  // the server. The DB is the bottleneck for compound-event queries anyway.
  let lastFetch = 0
  on('snapshot', () => {
    const now = Date.now()
    if (now - lastFetch > 30_000) {
      lastFetch = now
      refresh(box)
      refreshSensorHealth().catch(() => {})
    }
  })
  on('sensor-health', () => refresh(box))
  on('lang', () => refresh(box))
}

async function refresh(box) {
  const data = await getJson('/api/insights', 30_000)
  if (!data) {
    box.replaceChildren(el('div', { class: 'ins-empty' },
      tr('กำลังโหลดสัญญาณ…', 'Loading insights…')))
    return
  }
  lastInsights = data
  box.replaceChildren(...render(data))
}

function render(d) {
  const head = el('div', { class: 'ins-head' },
    el('div', { class: 'eyebrow' }, tr('สัญญาณเรียลไทม์ · REAL-TIME INSIGHTS', 'REAL-TIME INSIGHTS')),
    // Field-crew CSV — one row per flagged sensor with coordinates and the
    // exact flag (stale/flatline/outlier/mismatch). This is the operator
    // deliverable the audit asked for: an actionable list, not a number.
    el('a', {
      class: 'ins-csv-btn', href: '/api/sensors/dead.csv',
      title: tr('ดาวน์โหลด CSV สถานีที่มีปัญหา สำหรับทีมลงพื้นที่', 'Download CSV of suspect sensors for field crews'),
      download: '',
    },
      el('span', {}, '📋'),
      el('span', {}, tr(' ดาวน์โหลด CSV', ' Download CSV')),
    ),
    el('div', { class: 'ins-summary' },
      el('span', { class: 'ins-count critical' }, String(d.summary.by_severity.critical ?? 0)),
      el('span', { class: 'ins-count-label' }, tr('วิกฤต', 'CRITICAL')),
      el('span', { class: 'ins-count warn' }, String(d.summary.by_severity.warn ?? 0)),
      el('span', { class: 'ins-count-label' }, tr('เตือน', 'WARN')),
      el('span', { class: 'ins-count' }, String(d.summary.by_severity.info ?? 0)),
      el('span', { class: 'ins-count-label' }, tr('ข้อมูล', 'INFO'))),
    el('p', { class: 'ins-method' }, d.method_th + ' / ' + d.method_en))
  const quality = renderQualityBanner(store.sensorHealth)
  // Type filter (one row per type with its count)
  const types = Object.keys(d.summary.by_type).sort()
  const filter = el('div', { class: 'ins-typebar' },
    ...types.map((t) => el('button', {
      class: 'ins-type-chip',
      'data-type': t,
      onclick: () => filterByType(t),
    },
      el('span', { class: `ins-type-dot type-${t}` }),
      tr(TYPE_LABEL[t]?.th ?? t, TYPE_LABEL[t]?.en ?? t),
      el('span', { class: 'ins-type-num' }, String(d.summary.by_type[t]))))
  )
  // Insight cards
  const cards = d.insights.map(renderCard)
  const foot = el('div', { class: 'ins-foot' },
    tr('ดัชนีเฝ้าระวังเชิงปฏิบัติการ · อัปเดตทุก snapshot · ดู knowledge/risk-method.md',
       'Operational watch indicator · updates every snapshot · see knowledge/risk-method.md'))
  return [head, ...(quality ? [quality] : []), filter, ...cards, foot]
}

function renderQualityBanner(health) {
  if (!health) return null
  const score = health.quality_score ?? 0
  const s = health.summary ?? {}
  const band = score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'bad'
  return el('div', { class: `ins-quality ${band}` },
    el('div', { class: 'ins-quality-score' },
      el('span', { class: 'ins-quality-num' }, String(score)),
      el('span', { class: 'ins-quality-of' }, '/100')),
    el('div', { class: 'ins-quality-body' },
      el('div', { class: 'ins-quality-title' },
        tr('คุณภาพข้อมูลเซ็นเซอร์', 'SENSOR DATA QUALITY')),
      el('div', { class: 'ins-quality-stats' },
        statChip(tr('เงียบ', 'stale'), s.stale),
        statChip(tr('ค้าง', 'flatline'), s.flatline),
        statChip(tr('ผิดปกติ', 'outlier'), s.outlier),
        statChip(tr('ไม่สอดคล้อง', 'mismatch'), s.mismatch)),
      el('div', { class: 'ins-quality-note' },
        tr(
          `${fmtNum(s.total_stations)} สถานี · แฟล็ก = สัญญาณให้ตรวจสอบ ไม่ได้ตัดข้อมูลออก`,
          `${fmtNum(s.total_stations)} stations · flags are review hints, readings are never dropped`,
        ))))
}

function statChip(label, n) {
  return el('span', { class: 'ins-quality-stat' },
    el('span', { class: 'ins-quality-stat-n' }, String(n ?? 0)),
    label)
}

function filterByType(t) {
  // Toggle the chip — clicking hides cards of that type, clicking again shows.
  // Implemented by adding a class to the cards via a CSS attr.
  const box = document.getElementById('insights')
  if (!box) return
  const cards = box.querySelectorAll('.ins-card')
  for (const c of cards) {
    if (c.dataset.type === t) c.classList.toggle('hidden-by-type')
  }
  const chip = box.querySelector(`.ins-type-chip[data-type="${t}"]`)
  if (chip) chip.classList.toggle('off')
}

function renderCard(i) {
  const typeLabel = TYPE_LABEL[i.type]
  const sevLabel = SEV_LABEL[i.severity] ?? i.severity
  return el('div', {
    class: `ins-card sev-${i.severity}`,
    'data-type': i.type,
    onclick: () => { if (i.lat && i.lng) flyToProvince({ lat: i.lat, lng: i.lng, province_code: i.province }) },
  },
    el('div', { class: 'ins-card-head' },
      el('span', { class: 'ins-type-tag' }, tr(typeLabel?.th ?? i.type, typeLabel?.en ?? i.type)),
      el('span', { class: `ins-sev-tag sev-${i.severity}` }, tr(sevLabel.th, sevLabel.en))),
    el('div', { class: 'ins-title' }, tr(i.title_th, i.title_en)),
    el('div', { class: 'ins-body' }, tr(i.body_th, i.body_en)))
}
