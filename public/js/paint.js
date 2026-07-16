// Pure data-paint functions — accept a target layers object + snapshot slice.
// Imported by map.js (main map) and split.js (split-pane map B), so both
// panes render the same risk/water/rain/dams/aqi widgets from the same
// /api/snapshot stream with their own layer groups. No module-level state.
import { emit, store } from './state.js?v=2.0.0-final'
import { tr, pick, BAND, LEVEL_NAME } from './i18n.js?v=2.0.0-final'
import { fmtNum, fmtClock, escapeHtml } from './fmt.js?v=2.0.0-final'

const BAND_COLOR = { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#A51931' }
const LV_COLOR = { 1: '#B7AFA3', 2: '#948C7F', 3: '#00933C', 4: '#E86A10', 5: '#A51931' }

function popupHtml(title_th, title_en, rows) {
  // title/sub and row values ultimately trace back to government API station
  // names — escape before innerHTML so a malformed/compromised upstream feed
  // can't inject markup into the page.
  const kv = rows.filter(([, v]) => v !== null && v !== undefined && v !== '—')
    .map(([k, v]) => `<div class="pop-kv"><span>${k}</span><span class="v">${escapeHtml(v)}</span></div>`).join('')
  const isEn = store.lang === 'en'
  const title = isEn ? (title_en || title_th) : title_th
  const sub = isEn ? title_th : (title_en ?? '')
  return `<div class="pop-name">${escapeHtml(title)}</div><div class="pop-en">${escapeHtml(sub)}</div>${kv}`
}

export function paintRisk(layers, risk) {
  layers.risk.clearLayers()
  if (!risk?.provinces) return
  for (const p of risk.provinces) {
    if (p.lat === null || p.lng === null) continue
    const color = BAND_COLOR[p.band]
    const radius = 10 + p.score * 0.3
    L.circleMarker([p.lat, p.lng], {
      radius, color, weight: p.band === 'normal' ? 0.8 : 1.6,
      fillColor: color, fillOpacity: p.band === 'normal' ? 0.05 : 0.18, opacity: 0.85,
      pane: 'data',
    }).bindPopup(() => popupHtml(
      `${tr('จ.', 'Prov. ')}${tr(p.province_th, p.province_en)} — ${p.score}/100 ${BAND[p.band][store.lang]}`,
      `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${BAND[p.band].en}`,
      [
        [tr('สถานีน้ำมาก/ล้นตลิ่ง', 'L4/L5 stations'), `${p.stations_l4}/${p.stations_l5}`],
        [tr('ฝนสูงสุด 24 ชม.', 'max rain 24h'), p.max_rain_24h !== null ? `${fmtNum(p.max_rain_24h)} มม.` : '—'],
        [tr('คาดฝน 48 ชม.', 'forecast 48h'), p.fc_48h !== null ? `${fmtNum(p.fc_48h, 0)} มม.` : '—'],
      ],
    )).on('click', () => emit('province-select', p))
      .addTo(layers.risk)
  }
}

export function paintWater(layers, stations, { getZoom } = {}) {
  layers.water.clearLayers()
  if (!stations) return
  const detailed = getZoom ? getZoom() >= 8 : true
  for (const s of stations) {
    if (s.lat === null || s.lng === null) continue
    const lv = Math.round(s.situation_level ?? 0)
    const marker = lv >= 4 && detailed
      ? L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: '', iconSize: [18, 18],
            html: `<div class="stn-badge lv${lv}" style="width:18px;height:18px">${lv}</div>`,
          }),
          zIndexOffset: lv * 100,
          pane: 'data',
        })
      : L.circleMarker([s.lat, s.lng], {
          radius: lv >= 5 ? 5.5 : lv >= 4 ? 4.5 : 3,
          color: '#fff', weight: lv >= 4 ? 1 : 0.6,
          fillColor: LV_COLOR[lv] ?? '#B7AFA3', fillOpacity: lv >= 4 ? 1 : 0.85,
          pane: 'data',
        })
    marker.bindTooltip(() => `<b>${escapeHtml(tr(s.name_th, s.name_en))}</b><br>` +
      `${lv ? `${tr('ระดับ', 'lv')} ${lv} — ${LEVEL_NAME[lv][store.lang]}` : '—'} · ${fmtNum(s.wl_msl, 2)} ${tr('ม.รทก.', 'm MSL')}`,
      { direction: 'top', offset: [0, -6] })
    marker.bindPopup(() => popupHtml(
      tr(s.name_th, s.name_en),
      `${store.lang === 'th' ? (s.name_en ?? '') : (s.name_th ?? '')} · ${pick(s, 'province')}`,
      [
        [tr('สถานการณ์', 'status'), lv ? `${lv} — ${LEVEL_NAME[lv][store.lang]}` : '—'],
        [tr('ระดับน้ำ (ม.รทก.)', 'level (m MSL)'), fmtNum(s.wl_msl, 2)],
        [tr('% ความจุตลิ่ง', '% bank capacity'), s.storage_pct !== null ? `${fmtNum(s.storage_pct)}%` : '—'],
        [tr('ลุ่มน้ำ', 'basin'), pick(s, 'basin')],
        [tr('เวลา', 'time'), fmtClock(s.obs_time)],
      ],
    )).on('click', () => emit('station-select', { source: 'thaiwater_wl', station: s }))
    marker.addTo(layers.water)
  }
}

export function paintRain(layers, stations) {
  layers.rain.clearLayers()
  if (!stations) return
  for (const s of stations) {
    const mm = s.rain_24h ?? 0
    L.circleMarker([s.lat, s.lng], {
      radius: 2 + Math.min(9, Math.sqrt(mm)),
      stroke: false,
      fillColor: '#0039A6', fillOpacity: mm > 90 ? 0.55 : 0.25,
      pane: 'data',
    }).bindPopup(() => popupHtml(
      tr(s.name_th, s.name_en),
      `${store.lang === 'th' ? (s.name_en ?? '') : (s.name_th ?? '')} · ${pick(s, 'province')}`,
      [
        [tr('ฝน 24 ชม.', 'rain 24h'), `${fmtNum(mm)} มม.`],
        [tr('ฝน 1 ชม.', 'rain 1h'), s.rain_1h !== null ? `${fmtNum(s.rain_1h)} มม.` : '—'],
        [tr('เวลา', 'time'), fmtClock(s.obs_time)],
      ],
    )).on('click', () => emit('station-select', { source: 'thaiwater_rain', station: s }))
      .addTo(layers.rain)
  }
}

// Illustrative reservoir footprint: real Thai mainstem reservoirs run roughly
// 25-45m average depth (Bhumibol/Sirikit-scale), small irrigation reservoirs
// much shallower — 25m is a reasonable single assumption, not a surveyed
// shoreline. The point is relative scale (a 13,000 MCM dam visibly dwarfs a
// 100 MCM one once you zoom in), not an exact footprint.
const DAM_ASSUMED_DEPTH_M = 25
function damFootprintRadiusM(mcm) {
  if (!Number.isFinite(mcm) || mcm <= 0) return null
  const areaM2 = (mcm * 1e6) / DAM_ASSUMED_DEPTH_M
  return Math.sqrt(areaM2 / Math.PI)
}

export function paintDams(layers, dams) {
  layers.dams.clearLayers()
  if (!dams) return
  for (const d of dams) {
    if (d.lat === null || d.lng === null) continue
    const pct = Number.isFinite(d.dam_storage_pct) ? d.dam_storage_pct : null
    const hot = pct !== null && pct >= 90
    const maxStorage = d.meta?.max_storage_mcm
    const footprintMcm = Number.isFinite(maxStorage) ? maxStorage : d.dam_storage_mcm
    const radiusM = damFootprintRadiusM(footprintMcm)
    if (radiusM) {
      L.circle([d.lat, d.lng], {
        radius: radiusM, pane: 'data', interactive: false, stroke: false,
        fillColor: '#0E7C7B', fillOpacity: 0.16,
      }).addTo(layers.dams)
    }
    const name = tr(d.name_th, d.name_en)
    const tipRows = [
      [tr('กักเก็บ', 'storage'), pct !== null ? `${fmtNum(pct)}%` : '—'],
      [tr('ปริมาณน้ำ', 'volume'), `${fmtNum(d.dam_storage_mcm, 0)} MCM`],
    ]
    L.marker([d.lat, d.lng], {
      icon: L.divIcon({
        className: '',
        iconSize: [30, 18],
        html: `<div class="stn-badge" style="width:30px;height:18px;font-size:9.5px;background:${hot ? '#A51931' : '#0E7C7B'}">${pct !== null ? Math.round(pct) + '%' : tr('เขื่อน', 'Dam')}</div>`,
      }),
      pane: 'data',
    }).bindTooltip(() => `<b>${escapeHtml(name)}</b><br>` + tipRows.map(([k, v]) => `${k}: ${escapeHtml(v)}`).join(' · '),
      { direction: 'top', offset: [0, -10] })
      .bindPopup(() => popupHtml(
        `${tr('เขื่อน', 'Dam ')}${name}`,
        `${store.lang === 'th' ? (d.name_en ?? '') : (d.name_th ?? '')} · ${pick(d, 'province')}`,
        [
          [tr('กักเก็บ', 'storage'), pct !== null ? `${fmtNum(pct)}%` : '—'],
          [tr('ปริมาณน้ำ (ล้าน ลบ.ม.)', 'volume (MCM)'), fmtNum(d.dam_storage_mcm, 0)],
          [tr('ความจุสูงสุด (ล้าน ลบ.ม.)', 'max capacity (MCM)'), fmtNum(maxStorage, 0)],
          [tr('น้ำไหลเข้า', 'inflow (MCM)'), fmtNum(d.dam_inflow_mcm, 2)],
          [tr('ระบายออก', 'released (MCM)'), fmtNum(d.dam_released_mcm, 2)],
        ],
      )).on('click', () => emit('station-select', { source: 'thaiwater_dam', station: d, metric: 'dam_storage_pct' }))
      .addTo(layers.dams)
  }
}

export function paintAqi(layers, stations) {
  layers.aqi.clearLayers()
  if (!stations) return
  for (const s of stations) {
    if (s.lat === null || s.lng === null) continue
    const aqi = s.aqi
    const color = aqi === null ? '#B7AFA3' : aqi <= 50 ? '#00933C' : aqi <= 100 ? '#F0B400' : aqi <= 200 ? '#E86A10' : '#A51931'
    L.circleMarker([s.lat, s.lng], {
      radius: 4, color: '#fff', weight: 0.8, fillColor: color, fillOpacity: 0.85,
      pane: 'data',
    }).bindPopup(() => popupHtml(
      tr(s.name_th, s.name_en),
      `${store.lang === 'th' ? (s.name_en ?? '') : (s.name_th ?? '')} · ${pick(s, 'province')}`,
      [
        ['AQI', fmtNum(aqi, 0)],
        [tr('PM2.5 (ไมโครกรัม/ลบ.ม.)', 'PM2.5 (µg/m³)'), fmtNum(s.pm25)],
        [tr('เวลา', 'time'), fmtClock(s.obs_time)],
      ],
    )).addTo(layers.aqi)
  }
}
