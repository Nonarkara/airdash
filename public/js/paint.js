// Pure data-paint functions — accept a target layers object + snapshot slice.
// Imported by map.js so the map renders risk/air/rain widgets straight from
// the /api/snapshot stream with its own layer groups. No module-level state.
import { emit, store } from './state.js?v=2.4.14'
import { tr, pick, BAND, LEVEL_NAME, pm25Level } from './i18n.js?v=2.4.14'
import { fmtNum, fmtClock, escapeHtml } from './fmt.js?v=2.4.14'

const BAND_COLOR = { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#A51931' }

// Thai AQI 2023 PM2.5 palette, level 1–5 (≤15 · ≤25 · ≤37.5 · ≤75 · >75 µg/m³).
// Levels 3–5 reuse the band tokens (--band-watch/elevated/high); 1–2 are the
// two green steps below them. Thai-flag red stays reserved for genuine >75.
const PM_COLOR = { 1: '#1A7A4A', 2: '#7FA334', 3: '#F0B400', 4: '#E86A10', 5: '#A51931' }
const PM_NONE = '#B7AFA3'

/** Marker colour for a PM2.5 reading (µg/m³) — Thai AQI 2023 steps. */
export function pm25Color(ug) {
  const lv = pm25Level(ug)
  return lv === null ? PM_NONE : PM_COLOR[lv]
}

export function popupHtml(title_th, title_en, rows) {
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
        [tr('PM2.5 สูงสุด (มคก./ลบ.ม.)', 'worst PM2.5 (µg/m³)'), p.pm25 !== null ? fmtNum(p.pm25, 0) : '—'],
        [tr('คาด PM2.5 +24 ชม.', 'PM2.5 forecast +24h'), p.pm25_fc_24h !== null ? fmtNum(p.pm25_fc_24h, 0) : '—'],
        [tr('โอกาสฝน 24 ชม.', 'rain chance 24h'), p.precip_prob_24h !== null ? `${fmtNum(p.precip_prob_24h, 0)}%` : '—'],
      ],
    )).on('click', () => emit('province-select', p))
      .addTo(layers.risk)
  }
}

// Primary station layer — every Air4Thai AQ station, coloured by its PM2.5
// band. Above-moderate stations (level ≥4) render as square badges at detail
// zoom so the worst readings pop out of the dot field.
export function paintAir(layers, stations, { getZoom } = {}) {
  layers.air.clearLayers()
  if (!stations) return
  for (const s of stations) {
    if (s.lat === null || s.lng === null) continue
    const lv = pm25Level(s.pm25)
    const color = lv === null ? PM_NONE : PM_COLOR[lv]
    // Severity owns the visual hierarchy: stations past the health line
    // (level ≥4) always render as numeric badges — at EVERY zoom, level 5
    // pulsing — while good-air dots recede. A wall of green must never
    // drown the one red reading that matters.
    const marker = lv >= 4
      ? L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: '', iconSize: [22, 18],
            html: `<div class="stn-badge lv${lv}" style="width:22px;height:18px;background:${color}">${Math.round(s.pm25)}</div>`,
          }),
          zIndexOffset: lv * 100,
          pane: 'data',
        })
      : L.circleMarker([s.lat, s.lng], {
          radius: 3.5,
          color: '#fff', weight: 0.6,
          fillColor: color, fillOpacity: lv >= 3 ? 0.85 : 0.55,
          pane: 'data',
        })
    marker.bindTooltip(() => `<b>${escapeHtml(tr(s.name_th, s.name_en))}</b><br>` +
      `PM2.5 ${fmtNum(s.pm25, 0)} ${tr('มคก./ลบ.ม.', 'µg/m³')}${lv ? ` — ${LEVEL_NAME[lv][store.lang]}` : ''}`,
      { direction: 'top', offset: [0, -6] })
    marker.bindPopup(() => popupHtml(
      tr(s.name_th, s.name_en),
      `${store.lang === 'th' ? (s.name_en ?? '') : (s.name_th ?? '')} · ${pick(s, 'province')}`,
      [
        [tr('ระดับ', 'level'), lv ? `${lv} — ${LEVEL_NAME[lv][store.lang]}` : '—'],
        [tr('PM2.5 (มคก./ลบ.ม.)', 'PM2.5 (µg/m³)'), fmtNum(s.pm25, 0)],
        [tr('PM10 (มคก./ลบ.ม.)', 'PM10 (µg/m³)'), fmtNum(s.pm10, 0)],
        [tr('โอโซน O₃ (ppb)', 'ozone O₃ (ppb)'), fmtNum(s.o3, 0)],
        ['AQI', fmtNum(s.aqi, 0)],
        [tr('เวลา', 'time'), fmtClock(s.obs_time)],
      ],
    )).on('click', () => emit('station-select', { source: 'air4thai', station: s }))
    marker.addTo(layers.air)
  }
}

// Rain gauges seeing washout-grade rain — kept as observed verification that
// the promised washout is actually happening.
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
