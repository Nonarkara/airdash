// Airport visibility (METAR) on the map — the fastest dust signal on the board.
//
// WHY THIS IS A LAYER AND NOT ANOTHER NUMBER IN A PANEL
// METAR files every 30 minutes. Every other aerosol layer here is daily or
// slower, and the PM2.5 network is hourly. When a dust front crosses the
// Myanmar border at Mae Sot, this layer moves within half an hour while the
// satellite layers are still showing yesterday. A signal that arrives six
// times faster belongs on the map, not in a tab.
//
// THE HONESTY RULE, WHICH IS THE WHOLE DESIGN
// A visibility drop is NOT a haze measurement. Rain, mist, fog, snow, smoke,
// blowing sand and dust storms all collapse visibility, and only some of them
// are particulate air pollution. So a pin is rendered differently depending on
// WHAT CAUSED the drop, and the marker shape is the carrier:
//
//   ●  filled, band-coloured  — an AEROSOL cause (SA sand, HZ haze, FU smoke,
//                               DU dust, DS dust storm). This is a dust signal.
//   ○  hollow, grey outline   — a non-aerosol cause (rain, fog, mist, storm)
//                               or an unexplained drop. Visibility is genuinely
//                               low and there is NO aerosol attribution.
//   ·  small dot, no outline  — at the 10 km-or-more reporting ceiling. Nothing
//                               to see; a drop from 9.999 km to 8 km is not an
//                               event and must not be painted like one.
//
// The fourth state, which is the important one: a station with NO reading at
// all renders nothing rather than a grey "0". "Unreported" and "clear" are
// different claims and the map must not conflate them.
//
// A dot-to-dot comparison with the PM2.5 layer is therefore legitimate: a
// filled dot at Mae Sot with AOD rising upwind is a dust event; a hollow dot
// with PM2.5 at 8 µg/m³ is just rain.

import { tr } from '../i18n.js'
import { escapeHtml, fmtClock } from '../fmt.js'

/** Which band a visibility in km falls into, or null when there is no
 *  reading at all. Bands are coarse on purpose — this is a 30-minute feed
 *  from 23 stations, and a 6-band ramp on that sample would imply a
 *  precision the data does not have. */
export function visBand(km) {
  if (km === null || km === undefined || Number.isNaN(km)) return null
  if (km >= 9.999) return 'ceiling'
  if (km >= 8) return 'normal'
  if (km >= 5) return 'watch'
  if (km >= 2) return 'elevated'
  return 'high'
}

/** Marker class — the shape carries the attribution, the colour the severity. */
export function markerKind(st) {
  if (!st || st.vis_km === null) return 'none'
  const band = visBand(st.vis_km)
  if (band === 'ceiling') return 'ceiling'
  return st.aerosol_vis_km !== null ? 'aerosol' : 'other'
}

const CAUSE_TH = {
  aerosol: 'ฝุ่น/ควัน', precip: 'ฝน', obscure: 'หมอก/ไอน้ำ', clear: 'ท้องฟ้าแจ่ม', unknown: 'ไม่ทราบสาเหตุ',
}
const CAUSE_EN = {
  aerosol: 'aerosol', precip: 'rain', obscure: 'fog/mist', clear: 'clear', unknown: 'cause not reported',
}

export function createVisibilityLayer() {
  const group = L.layerGroup()
  group._airdashKind = 'visibility'
  const url = '/api/visibility'
  const keys = ['?v=2.4.51']
  const state = { data: null, timer: null }

  const tip = (st) => {
    const kind = markerKind(st)
    const causeTh = CAUSE_TH[st.cause] ?? CAUSE_TH.unknown
    const causeEn = CAUSE_EN[st.cause] ?? CAUSE_EN.unknown
    const visTh = st.vis_km === null ? '—' : `${st.vis_km.toFixed(1)} กม.`
    const visEn = st.vis_km === null ? '—' : `${st.vis_km.toFixed(1)} km`
    // The attribution line is the reason this layer can be trusted. It is
    // stated on every pin, not hidden behind a hover on a legend.
    const attrTh = kind === 'aerosol'
      ? 'ลดทอดแสงจากฝุ่น/ควัน — สัญญาณฝุ่นจริง'
      : kind === 'ceiling'
        ? 'ทัศนวิสัยดี (10 กม. ขึ้นไป)'
        : kind === 'other'
          ? `ระยะมองลดลง แต่สาเหตุคือ${causeTh} ไม่ใช่ฝุ่น — ไม่นับเป็นสัญญาณฝุ่น`
          : 'ไม่มีข้อมูล'
    const attrEn = kind === 'aerosol'
      ? 'extinction attributed to aerosol — a dust signal'
      : kind === 'ceiling'
        ? 'good visibility (10 km or more)'
        : kind === 'other'
          ? `visibility reduced, but the cause is ${causeEn}, not dust — NOT counted as a dust signal`
          : 'no data'
    return `<div class="vis-tip">
      <b>${escapeHtml(st.name_th || st.name_en || st.icao)}</b>
      <span class="vis-tip-en">${escapeHtml(st.name_en || '')}</span>
      <div class="vis-tip-vis"><span>${escapeHtml(visTh)}</span><span>${escapeHtml(visEn)}</span></div>
      <div class="vis-tip-cause">${escapeHtml(attrTh)}</div>
      <div class="vis-tip-cause vis-tip-cause-en">${escapeHtml(attrEn)}</div>
      ${st.obs_time ? `<div class="vis-tip-time">${tr('รายงานเมื่อ', 'reported')} ${fmtClock(st.obs_time)}</div>` : ''}
    </div>`
  }

  function draw() {
    group.clearLayers()
    const rows = state.data?.stations ?? []
    for (const st of rows) {
      if (st.lat == null || st.lng == null) continue
      const kind = markerKind(st)
      if (kind === 'none') continue
      const band = visBand(st.vis_km)
      const m = L.marker([st.lat, st.lng], {
        // A hollow marker for a non-aerosol drop is the point of the design,
        // so the shape is carried by the icon class rather than the colour.
        className: `vis-pin vis-${kind}${band ? ' vis-b-' + band : ''}`,
        icon: L.divIcon({ className: '', html: '', iconSize: [14, 14], iconAnchor: [7, 7] }),
        keyboard: false, // 23 pins; the panel list is the keyboard path
        title: `${st.icao} ${st.vis_km ?? '—'} km`,
      })
      m.bindTooltip(tip(st), { direction: 'top', offset: [0, -8], className: 'vis-tip-wrap' })
      m.addTo(group)
    }
  }

  async function refresh() {
    try {
      const res = await fetch(url + keys.join(''), { headers: { accept: 'application/json' } })
      if (!res.ok) return
      state.data = await res.json()
      draw()
    } catch { /* a transient fetch failure must not clear the map */ }
  }

  return {
    group,
    refresh,
    onAdd() {
      refresh()
      // 5 minutes, not 30: the layer's value is that it is fresher than
      // everything else on the board, and the endpoint is a single small JSON
      // document.
      state.timer = setInterval(refresh, 5 * 60_000)
    },
    onRemove() {
      if (state.timer) { clearInterval(state.timer); state.timer = null }
      group.clearLayers()
    },
    get data() { return state.data },
  }
}
