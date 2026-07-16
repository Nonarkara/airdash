// Left-rail drill-down: province detail (its stations) or a single station
// with a 72-hour chart from /api/series. Charts are zero-dep canvas via
// /js/chart.js so they re-render cheaply when new snapshots arrive.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr, pick, LEVEL_NAME } from '../i18n.js?v=2.0.0-final'
import { fmtNum, fmtClock, el } from '../fmt.js?v=2.0.0-final'
import { flyToStation } from '../map.js?v=2.0.0-final'
import { drawSeriesChart } from '../chart.js?v=2.0.0-final'
import { provinceHealth } from '../sensorHealth.js?v=2.0.0-final'

let current = null // {type:'province', p} | {type:'station', source, station, metric}
let lastSeries = null // last fetched points so we can re-paint on lang/snapshot

export function initDetail() {
  on('station-select', ({ source, station, metric }) => showStationDetail(source, station, metric))
  on('lang', () => rerender())
  on('snapshot', () => { if (current?.type === 'province') rerender() })
  on('sensor-health', () => { if (current?.type === 'province') rerender() })
}

function box() { return document.getElementById('detail') }
// Sibling widgets that compete for vertical space — hide when detail opens
// so the chart has room, restore on back.
function hideSiblingsForDetail() {
  const ids = ['forecast-strip', 'whatif']
  for (const id of ids) {
    const el = document.getElementById(id)
    if (el) el.dataset.fdPrevDisplay = el.style.display
    if (el) el.style.display = 'none'
  }
}
function restoreSiblings() {
  const ids = ['forecast-strip', 'whatif']
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    const prev = el.dataset.fdPrevDisplay ?? ''
    el.style.display = prev
  }
}
function show() {
  document.getElementById('ranking').style.display = 'none'
  box().style.display = 'block'
  hideSiblingsForDetail()
}
export function hideDetail() {
  current = null
  lastSeries = null
  box().style.display = 'none'
  document.getElementById('ranking').style.display = 'block'
  restoreSiblings()
}
function backButton() {
  return el('button', { class: 'detail-back', onclick: hideDetail }, tr('← กลับอันดับจังหวัด', '← back to ranking'))
}
function rerender() {
  if (current?.type === 'province') showProvinceDetail(current.p)
  else if (current?.type === 'station' && lastSeries) paintChart(lastSeries, current.metric)
}

export function showProvinceDetail(p) {
  current = { type: 'province', p }
  show()
  const snap = store.snapshot
  const stations = (snap?.water ?? [])
    .filter((s) => s.province_th === p.province_th)
    .sort((a, b) => (b.situation_level ?? 0) - (a.situation_level ?? 0))
    .slice(0, 30)
  const rains = (snap?.rain ?? [])
    .filter((s) => s.province_th === p.province_th)
    .sort((a, b) => (b.rain_24h ?? 0) - (a.rain_24h ?? 0))
    .slice(0, 10)

  const pq = provinceHealth(p.province_code)
  const qualityNote = pq && (pq.stale + pq.flatline + pq.outlier + pq.mismatch) > 0
    ? el('div', { class: 'detail-quality warn' },
        tr(
          `ข้อมูลน่าสงสัย ${pq.stale + pq.flatline + pq.outlier + pq.mismatch} สถานี — เงียบ ${pq.stale} · ค้าง ${pq.flatline} · ผิดปกติ ${pq.outlier} · ไม่สอดคล้อง ${pq.mismatch}`,
          `${pq.stale + pq.flatline + pq.outlier + pq.mismatch} suspicious stations — stale ${pq.stale} · flatline ${pq.flatline} · outlier ${pq.outlier} · mismatch ${pq.mismatch}`,
        ))
    : null

  box().replaceChildren(
    backButton(),
    el('div', { class: 'detail-block' },
      el('h3', {}, `${tr('จ.', 'Prov. ')}${tr(p.province_th, p.province_en)}`),
      el('div', { class: 'eyebrow' }, `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${tr('คะแนน', 'score')} ${p.score}/100`),
      qualityNote),
    el('div', { class: 'detail-block' },
      el('div', { class: 'eyebrow' }, tr('สถานีระดับน้ำ', 'WATER-LEVEL STATIONS')),
      stations.length === 0 ? el('div', { class: 'detail-kv' }, tr('ไม่มีสถานีในจังหวัดนี้', 'no stations here')) :
      stations.map((s) => {
        const lv = Math.round(s.situation_level ?? 0)
        return el('div', {
          class: 'detail-kv', style: 'cursor:pointer',
          onclick: () => { flyToStation(s); showStationDetail('thaiwater_wl', s) },
        },
          el('span', {}, el('span', { class: `badge lv${lv || 1}`, style: 'margin-right:6px' }, lv ? String(lv) : '·'), tr(s.name_th, s.name_en)),
          el('span', { class: 'v' }, s.storage_pct !== null ? `${fmtNum(s.storage_pct, 0)}%` : fmtNum(s.wl_msl, 2)))
      })),
    rains.length > 0 ? el('div', { class: 'detail-block' },
      el('div', { class: 'eyebrow' }, tr('ฝนสะสมสูงสุด 24 ชม.', 'TOP RAIN 24H')),
      rains.map((s) => el('div', {
        class: 'detail-kv', style: 'cursor:pointer',
        onclick: () => { flyToStation(s); showStationDetail('thaiwater_rain', s, 'rain_24h') },
      },
        el('span', {}, tr(s.name_th, s.name_en)),
        el('span', { class: 'v' }, `${fmtNum(s.rain_24h)} มม.`)))) : null,
  )
}

const METRIC_LABEL = {
  wl_msl: { th: 'ระดับน้ำ (ม.รทก.)', en: 'water level (m MSL)' },
  storage_pct: { th: '% ความจุตลิ่ง', en: '% bank capacity' },
  rain_24h: { th: 'ฝนสะสม 24 ชม. (มม.)', en: 'rain 24h (mm)' },
  dam_storage_pct: { th: '% กักเก็บเขื่อน', en: 'dam storage %' },
}

const METRIC_UNIT = {
  wl_msl: 'm MSL',
  storage_pct: '%',
  rain_24h: 'mm',
  dam_storage_pct: '%',
}

export async function showStationDetail(source, s, metric) {
  const m = metric ?? (source === 'thaiwater_rain' ? 'rain_24h' : source === 'thaiwater_dam' ? 'dam_storage_pct' : 'wl_msl')
  current = { type: 'station', source, station: s, metric: m }
  show()

  const lv = Math.round(s.situation_level ?? 0)
  const info = [
    source === 'thaiwater_wl' && lv ? [tr('สถานการณ์', 'status'), `${lv} — ${LEVEL_NAME[lv][store.lang]}`] : null,
    s.wl_msl !== undefined ? [tr('ระดับน้ำ', 'level'), `${fmtNum(s.wl_msl, 2)} ${tr('ม.รทก.', 'm MSL')}`] : null,
    s.storage_pct !== undefined && s.storage_pct !== null ? [tr('% ความจุตลิ่ง', '% bank'), `${fmtNum(s.storage_pct)}%`] : null,
    s.rain_24h !== undefined ? [tr('ฝน 24 ชม.', 'rain 24h'), `${fmtNum(s.rain_24h)} มม.`] : null,
    s.dam_storage_pct !== undefined ? [tr('กักเก็บ', 'storage'), `${fmtNum(s.dam_storage_pct)}%`] : null,
    [tr('จังหวัด', 'province'), pick(s, 'province')],
    [tr('ลุ่มน้ำ', 'basin'), pick(s, 'basin')],
    [tr('อัปเดต', 'updated'), fmtClock(s.obs_time)],
  ].filter(Boolean)

  // Threshold bands (% bank capacity: watch 80, danger 95)
  const thresholds = m === 'storage_pct' || m === 'dam_storage_pct'
    ? { warn: 80, danger: 95 }
    : (m === 'wl_msl' && Number.isFinite(s.wl_msl) && Number.isFinite(s.storage_pct)
        ? deriveWlThresholds(s)
        : null)

  box().replaceChildren(
    backButton(),
    el('div', { class: 'detail-block' },
      el('h3', {}, tr(s.name_th, s.name_en) || s.key),
      el('div', { class: 'eyebrow' }, store.lang === 'th' ? (s.name_en ?? '') : (s.name_th ?? ''))),
    el('div', { class: 'detail-block' },
      ...info.map(([k, v]) => el('div', { class: 'detail-kv' }, el('span', {}, k), el('span', { class: 'v' }, v)))),
    el('div', { class: 'detail-block' },
      el('div', { class: 'eyebrow' },
        `${METRIC_LABEL[m]?.[store.lang] ?? m} · 72 ${tr('ชม.', 'H')}`,
        thresholds
          ? el('span', { class: 'chart-legend' },
              el('span', { class: 'dot warn' }),
              tr('เฝ้าระวัง', 'watch'),
              el('span', { class: 'dot danger' }),
              tr('อันตราย', 'danger'))
          : null),
      el('div', { id: 'spark-loading' }, tr('กำลังโหลดกราฟ…', 'loading series…')),
      el('canvas', { class: 'detail-chart', id: 'detail-chart' }),
    ),
  )

  // After the canvas is in the DOM, size it to the parent and start fetching.
  const canvas = document.getElementById('detail-chart')
  if (canvas) {
    const parent = canvas.parentElement
    canvas.style.width = (parent.clientWidth - 4) + 'px'
    canvas.style.height = '120px'
  }

  try {
    const res = await fetch(`/api/series?source=${source}&station=${encodeURIComponent(s.key)}&metric=${m}&hours=72`)
    const data = await res.json()
    lastSeries = data.points ?? []
    paintChart(lastSeries, m, thresholds)
  } catch {
    const loading = document.getElementById('spark-loading')
    if (loading) loading.textContent = tr('โหลดกราฟไม่สำเร็จ', 'failed to load series')
  }
}

// Derive a "watch" and "danger" water-level band from the current
// storage_pct if available — bankful onset ≈ 80%, danger ≈ 95% — then
// back-convert to a wl_msl value so we can draw threshold bands on the
// chart for stations that don't ship explicit thresholds.
function deriveWlThresholds(s) {
  if (s.wl_msl == null || s.storage_pct == null || s.storage_pct <= 0) return null
  const wlPerPercent = s.wl_msl / s.storage_pct
  return {
    warn: wlPerPercent * 80,
    danger: wlPerPercent * 95,
  }
}

function paintChart(points, metric, thresholds) {
  const canvas = document.getElementById('detail-chart')
  if (!canvas) return
  const loading = document.getElementById('spark-loading')
  if (loading) loading.style.display = 'none'
  if (!drawSeriesChart(canvas, points, {
    color: '#241E4E',
    padding: 22,
    showAxes: true,
    showNow: true,
    unit: METRIC_UNIT[metric] ?? '',
    thresholds,
  })) {
    if (loading) {
      loading.style.display = ''
      loading.textContent = tr('ยังมีข้อมูลไม่พอ (ระบบเพิ่งเริ่มเก็บ)',
        'not enough history yet (collection just started)')
    }
  }
}
