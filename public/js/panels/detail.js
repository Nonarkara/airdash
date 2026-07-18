// Left-rail drill-down: province detail (its AQ stations) or a single
// station with a 72-hour chart from /api/series. Charts are zero-dep canvas
// via /js/chart.js so they re-render cheaply when new snapshots arrive.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr, pick } from '../i18n.js?v=2.0.0-final'
import { fmtNum, fmtClock, el } from '../fmt.js?v=2.0.0-final'
import { flyToStation } from '../map.js?v=2.0.0-final'
import { drawSeriesChart } from '../chart.js?v=2.0.0-final'
import { provinceHealth } from '../sensorHealth.js?v=2.0.0-final'
import { causeChip, causesByProvince, causeEvidenceBlock, provincePatternsBlock } from './patterns-ui.js?v=2.0.0-final'

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

// Thai AQI 2023 badge level for a PM2.5 value (µg/m³): reuses the existing
// lv badge classes — lv5 red (very unhealthy), lv4 orange (unhealthy),
// lv3 green (fine), lv1/2 grey (low/no data).
function pm25Lv(v) {
  if (v === null || v === undefined) return 0
  if (v >= 75) return 5
  if (v >= 37.5) return 4
  return 3
}

export function showProvinceDetail(p) {
  current = { type: 'province', p }
  show()
  const snap = store.snapshot
  const stations = (snap?.air ?? [])
    .filter((s) => s.province_th === p.province_th)
    .sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
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

  // Danger breakdown block — surfaces the composite's four modifiers so the
  // user can see WHY the Danger Score is what it is. PM, heat, humidity,
  // rain are all named with their actual numeric contribution. Research
  // paper Section 2 has the full citation trail.
  const d = p.danger
  const dangerBlock = d ? el('div', { class: 'detail-block detail-danger' },
    el('div', { class: 'eyebrow' }, tr('ดัชนีอันตราย · Danger Score', 'DANGER SCORE · COMPOSITE')),
    el('div', { class: 'danger-big-row' },
      el('div', { class: `danger-big b-${d.band}` },
        el('span', { class: 'db-num' }, String(d.score)),
        el('span', { class: 'db-band' }, tr(d.label_th, d.label_en)),
      ),
      d.trend_24h != null && Math.abs(d.trend_24h) >= 5
        ? el('div', { class: `danger-trend ${d.trend_24h > 0 ? 'up' : 'down'}` },
            d.trend_24h > 0
              ? `↑ +${d.trend_24h} ${tr('ใน 24 ชม. ข้างหน้า', 'in next 24h')}`
              : `↓ ${d.trend_24h} ${tr('ใน 24 ชม. ข้างหน้า', 'in next 24h')}`)
        : null),
    el('div', { class: 'danger-mods' },
      el('div', { class: 'dm-row' },
        el('span', { class: 'dm-k' }, tr('PM2.5 ฐาน', 'PM2.5 base')),
        el('span', { class: 'dm-v' }, `${d.pm25_live != null ? d.pm25_live.toFixed(0) : '–'} µg/m³ → ${d.pm_base}`)),
      el('div', { class: 'dm-row' },
        el('span', { class: 'dm-k' }, tr('ความร้อน (heat amp)', 'Heat amp')),
        el('span', { class: 'dm-v' },
          d.temp_c != null ? `${d.temp_c.toFixed(0)}°C` : '–',
          ` ×(1+${(d.heat_amp).toFixed(2)})`)),
      el('div', { class: 'dm-row' },
        el('span', { class: 'dm-k' }, tr('ความชื้น (hygroscopic)', 'RH amp')),
        el('span', { class: 'dm-v' },
          d.rh_pct != null ? `${d.rh_pct.toFixed(0)}%` : '–',
          ` ×(1+${(d.hum_amp).toFixed(2)})`)),
      el('div', { class: 'dm-row' },
        el('span', { class: 'dm-k' }, tr('เสียง (noise amp)', 'Noise amp')),
        el('span', { class: 'dm-v' },
          d.noise_leq_db != null
            ? `${d.noise_leq_db.toFixed(0)} dB${d.noise_stations > 1 ? ` · ${d.noise_stations} stn` : ''}`
            : '– ไม่มีสถานี',
          d.noise_leq_db != null ? ` ×(1+${(d.noise_amp).toFixed(2)})` : '')),
      el('div', { class: 'dm-row' },
        el('span', { class: 'dm-k' }, tr('ฝน (relief)', 'Rain relief')),
        el('span', { class: 'dm-v' },
          d.rain_obs_24 != null ? `${d.rain_obs_24.toFixed(0)} มม. สังเกต` :
            (d.rain_fc_24 != null ? `${d.rain_fc_24.toFixed(0)} มม. คาด` : '–'),
          ` −${(d.rain_relief * 100).toFixed(0)}%`)),
    ),
    el('div', { class: 'danger-method' },
      tr(
        `สูตร: PM × (1+heat) × (1+RH) × (1+noise) − rain — ดูวิธีคำนวณในงานวิจัยข้อ 2`,
        `formula: PM × (1+heat) × (1+RH) × (1+noise) − rain — see research paper §2 for citations`)),
  ) : null

  // WHY block — cause hypothesis chip inline, ranked evidence loaded async
  // from /api/causes (the fold in the snapshot only carries the top cause).
  const causeWrap = el('div', { class: 'detail-cause-wrap' })
  if (p.province_code) {
    causesByProvince().then((map) => {
      const block = causeEvidenceBlock(map.get(p.province_code))
      if (block && current?.type === 'province' && current.p?.province_code === p.province_code) {
        causeWrap.replaceChildren(block)
      }
    }).catch(() => {})
  }

  // NOTE: replaceChildren coerces a literal null into the text "null"
  // (Web IDL DOMString), so the child list is filtered below.
  box().replaceChildren(...[
    backButton(),
    el('div', { class: 'detail-block' },
      el('h3', {}, `${tr('จ.', 'Prov. ')}${tr(p.province_th, p.province_en)}`),
      el('div', { class: 'eyebrow' }, `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${tr('คะแนน', 'score')} ${p.score}/100`),
      p.cause ? el('div', { class: 'detail-cause-line' }, causeChip(p.cause)) : null,
      qualityNote),
    causeWrap,
    dangerBlock,
    p.province_code ? provincePatternsBlock(p.province_code) : null,
    el('div', { class: 'detail-block' },
      el('div', { class: 'eyebrow' }, tr('สถานีวัดคุณภาพอากาศ', 'AIR-QUALITY STATIONS')),
      stations.length === 0 ? el('div', { class: 'detail-kv' }, tr('ไม่มีสถานีในจังหวัดนี้', 'no stations here')) :
      stations.map((s) => {
        const lv = pm25Lv(s.pm25)
        return el('div', {
          class: 'detail-kv', style: 'cursor:pointer',
          onclick: () => { flyToStation(s); showStationDetail('air4thai', s) },
        },
          el('span', {}, el('span', { class: `badge lv${lv || 1}`, style: 'margin-right:6px' }, lv ? '●' : '·'), tr(s.name_th, s.name_en)),
          el('span', { class: 'v' }, s.pm25 !== null && s.pm25 !== undefined ? `${fmtNum(s.pm25, 0)} µg` : (s.aqi !== null && s.aqi !== undefined ? `AQI ${fmtNum(s.aqi, 0)}` : '—')))
      })),
    rains.length > 0 ? el('div', { class: 'detail-block' },
      el('div', { class: 'eyebrow' }, tr('ฝนสะสมสูงสุด 24 ชม. (ช่วยล้างฝุ่น)', 'TOP RAIN 24H (WASHOUT)')),
      rains.map((s) => el('div', {
        class: 'detail-kv', style: 'cursor:pointer',
        onclick: () => { flyToStation(s); showStationDetail('thaiwater_rain', s, 'rain_24h') },
      },
        el('span', {}, tr(s.name_th, s.name_en)),
        el('span', { class: 'v' }, `${fmtNum(s.rain_24h)} มม.`)))) : null,
  ].filter(Boolean))
}

const METRIC_LABEL = {
  pm25: { th: 'PM2.5 (µg/m³)', en: 'PM2.5 (µg/m³)' },
  pm10: { th: 'PM10 (µg/m³)', en: 'PM10 (µg/m³)' },
  o3: { th: 'โอโซน O₃ (ppb)', en: 'ozone O₃ (ppb)' },
  aqi: { th: 'ดัชนี AQI', en: 'AQI index' },
  rain_24h: { th: 'ฝนสะสม 24 ชม. (มม.)', en: 'rain 24h (mm)' },
}

const METRIC_UNIT = {
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  o3: 'ppb',
  aqi: '',
  rain_24h: 'mm',
}

export async function showStationDetail(source, s, metric) {
  const m = metric ?? (source === 'thaiwater_rain' ? 'rain_24h' : 'pm25')
  current = { type: 'station', source, station: s, metric: m }
  show()

  const info = [
    s.pm25 !== undefined && s.pm25 !== null ? ['PM2.5', `${fmtNum(s.pm25, 1)} µg/m³`] : null,
    s.pm10 !== undefined && s.pm10 !== null ? ['PM10', `${fmtNum(s.pm10, 1)} µg/m³`] : null,
    s.o3 !== undefined && s.o3 !== null ? ['O₃', `${fmtNum(s.o3, 1)} ppb`] : null,
    s.aqi !== undefined && s.aqi !== null ? ['AQI', fmtNum(s.aqi, 0)] : null,
    s.rain_24h !== undefined ? [tr('ฝน 24 ชม.', 'rain 24h'), `${fmtNum(s.rain_24h)} มม.`] : null,
    [tr('จังหวัด', 'province'), pick(s, 'province')],
    [tr('อัปเดต', 'updated'), fmtClock(s.obs_time)],
  ].filter(Boolean)

  // Threshold bands — Thai AQI 2023 PM2.5: unhealthy 37.5, very unhealthy 75.
  const thresholds = m === 'pm25'
    ? { warn: 37.5, danger: 75 }
    : (m === 'pm10' ? { warn: 80, danger: 120 } : null)

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
              tr('เกินเกณฑ์', 'unhealthy'),
              el('span', { class: 'dot danger' }),
              tr('อันตราย', 'very unhealthy'))
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
    const res = await fetch(`/api/series?source=${source}&station=${encodeURIComponent(s.key ?? s.station_key)}&metric=${m}&hours=72`)
    const data = await res.json()
    lastSeries = data.points ?? []
    paintChart(lastSeries, m, thresholds)
  } catch {
    const loading = document.getElementById('spark-loading')
    if (loading) loading.textContent = tr('โหลดกราฟไม่สำเร็จ', 'failed to load series')
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
