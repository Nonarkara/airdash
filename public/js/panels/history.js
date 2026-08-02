// Daily data archive — every day AirDash has collected, from
// /api/export/days. Click a day to see its air-quality rollup (worst PM2.5
// stations, series/alert counts) inline, or download the day as CSV/JSON.
import { on, store } from '../state.js?v=2.4.0'
import { tr } from '../i18n.js?v=2.4.0'
import { fmtNum, el } from '../fmt.js?v=2.4.0'
import { getJson } from '../cache.js?v=2.4.0'

let days = null
let openDay = null      // date string currently expanded
let openBundle = null   // fetched daily bundle for openDay

export function initHistory() {
  load()
  on('lang', paint)
}

async function load() {
  try {
    const j = await getJson('/api/export/days?limit=30', 5 * 60_000)
    days = j?.days ?? []
    paint()
  } catch {
    const box = document.getElementById('history')
    if (box) box.textContent = tr('โหลดรายการวันไม่สำเร็จ', 'failed to load day list')
  }
}

function paint() {
  const box = document.getElementById('history')
  if (!box || !days) return
  box.replaceChildren(
    el('div', { class: 'hist-intro' },
      el('div', { class: 'eyebrow' }, tr('คลังข้อมูลรายวัน', 'DAILY DATA ARCHIVE')),
      el('p', {}, tr(
        'ข้อมูลฝุ่น/ฝนที่ระบบเก็บไว้ในแต่ละวัน — คลิกวันเพื่อดูสรุป หรือดาวน์โหลด CSV/JSON',
        'Every day of collected air + rain data — click a day for its summary, or download CSV/JSON'))),
    ...days.map(renderDay),
    el('div', { class: 'hist-foot' },
      tr('ค่ารายวัน = min/max/avg ต่อสถานี/ตัวชี้วัด · ดู /api/export/days สำหรับ API',
         'Daily values = per-station/metric min/max/avg · see /api/export/days for the API')),
  )
}

function renderDay(d) {
  const isOpen = openDay === d
  const card = el('div', { class: `hist-card${isOpen ? ' open' : ''}` },
    el('div', {
      class: 'hist-head', style: 'cursor:pointer',
      onclick: () => toggleDay(d),
    },
      el('span', { class: 'hist-year' }, d),
      el('span', { class: 'hist-sev' },
        el('a', {
          href: `/api/export/daily?date=${d}&format=csv`, class: 'src-day',
          title: tr(`ดาวน์โหลด CSV ${d}`, `download CSV ${d}`),
          onclick: (ev) => ev.stopPropagation(),
        }, 'CSV'),
        ' · ',
        el('a', {
          href: `/api/export/daily?date=${d}&format=json`, class: 'src-day',
          title: tr(`ดู JSON ${d}`, `view JSON ${d}`),
          onclick: (ev) => ev.stopPropagation(),
        }, 'JSON'))),
    isOpen ? renderSummary(d) : null,
  )
  return card
}

async function toggleDay(d) {
  if (openDay === d) {
    openDay = null
    openBundle = null
    paint()
    return
  }
  openDay = d
  openBundle = null
  paint()
  try {
    openBundle = await getJson(`/api/export/daily?date=${d}`, 10 * 60_000)
  } catch {
    openBundle = { error: true }
  }
  if (openDay === d) paint()
}

function renderSummary(d) {
  if (!openBundle) {
    return el('div', { class: 'hist-fact' }, tr('กำลังโหลดสรุป…', 'loading summary…'))
  }
  if (openBundle.error) {
    return el('div', { class: 'hist-fact' }, tr('โหลดสรุปไม่สำเร็จ', 'failed to load summary'))
  }
  const c = openBundle.counts ?? {}
  const pmRows = (openBundle.stations ?? [])
    .filter((s) => s.metric === 'pm25' && s.v_max !== null)
    .sort((a, b) => (b.v_max ?? 0) - (a.v_max ?? 0))
    .slice(0, 8)
  return el('div', { class: 'hist-summary' },
    el('p', { class: 'hist-fact' },
      tr(`ชุดข้อมูล ${fmtNum(c.series ?? 0, 0)} รายการ · แจ้งเตือน ${c.alerts ?? 0} ครั้ง · รอบดึงข้อมูล ${c.ingest_runs ?? 0} รอบ`,
         `${fmtNum(c.series ?? 0, 0)} series · ${c.alerts ?? 0} alerts · ${c.ingest_runs ?? 0} ingest runs`)),
    pmRows.length
      ? el('div', {},
          el('div', { class: 'eyebrow' }, tr('PM2.5 สูงสุดของวัน', 'WORST PM2.5 OF THE DAY')),
          ...pmRows.map((s) => el('div', { class: 'detail-kv' },
            el('span', {}, `${tr(s.name_th, s.name_en) ?? s.station_key} · ${tr(s.province_th, s.province_en) ?? ''}`),
            el('span', { class: 'v' }, `${fmtNum(s.v_max, 0)} µg (avg ${fmtNum(s.v_avg, 0)})`))))
      : el('p', { class: 'hist-fact' }, tr('ไม่มีข้อมูล PM2.5 ในวันนี้', 'no PM2.5 data this day')),
  )
}
