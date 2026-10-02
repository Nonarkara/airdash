// Citizen and press haze reports, pinned to the map.
//
// WHAT THIS LAYER IS
// ------------------
// Public reports about air — from Thai news RSS and the international climate
// desks — each one geocoded to a place and pinned. The pin colour is the
// ground PM2.5 of the nearest station, so the map answers the actual question
// rather than just showing where articles were written.
//
// WHY A REPORT IS NOT DRAWN AS A CONFIDENT DOT
// --------------------------------------------
// The geocoder reports two separate things, and this layer draws them
// separately because conflating them would be a lie:
//
//   pin_precision 1 = a PROVINCE CENTROID. The article said "Chiang Mai"; we
//                    know the province and we drew its middle, which may be
//                    80 km from whatever the article meant. Small hollow dot.
//   pin_precision 2 = a LANDMARK POINT. The article named a specific dam or
//                    mountain and we have that place's own coordinate.
//                    Filled dot.
//
// A reader can tell at a glance which is which, and neither is dressed up as
// a measurement.
//
// WHY THE CLAIM LABEL IS THE POINT
// --------------------------------
// ฝุ่น and ฝนพิชั่น are both "haze" in English and they call for opposite
// advice: one is a fire burning somewhere and the person should look upwind on
// the fire layer; the other is rain coming that will clear it. A layer that
// drew both as the same dot would be useless exactly when someone needs to
// decide whether to stay inside. So each pin carries its claim and the popup
// says what the text actually claimed.
//
// EVERY PIN IS ATTRIBUTED. The credit line is non-nullable in the schema and
// the popup links the publisher's own URL. A report you cannot trace to its
// source does not belong on a public-health map.

import { tr } from '../i18n.js?v=2.4.63'
import { escapeHtml } from '../fmt.js?v=2.4.63'
import { pm25Color } from '../paint.js?v=2.4.63'

const REFRESH_MS = 10 * 60_000
const NO_PM25 = '#8C9AA5'

/** Claim → icon + label. Only smoke and washout get an icon: those are the
 *  two a citizen can act on differently. */
const CLAIM_META = {
  smoke: { th: 'ควันไฟ', en: 'fire smoke', icon: '🔥' },
  washout: { th: 'ฝนจะล้าง', en: 'rain incoming', icon: '🌧️' },
  dust: { th: 'ฝุ่นทราย', en: 'dust', icon: '🏜️' },
  fog: { th: 'หมอก', en: 'fog', icon: '🌫️' },
}

/** The strongest claim wins the icon, in the order a citizen would act. */
const CLAIM_ORDER = ['smoke', 'washout', 'dust', 'fog']

export function createCitizenLayer(map) {
  const group = L.layerGroup([], { pane: 'data' })
  let reports = []
  let sources = []
  let note = ''
  let timer = null
  let fetching = false

  function primaryClaim(claims) {
    if (!claims) return null
    return CLAIM_ORDER.find((k) => claims[k]) ?? null
  }

  function popupHtml(r) {
    const claim = primaryClaim(r.claims)
    const cm = claim ? CLAIM_META[claim] : null
    const color = Number.isFinite(r.pm25_nearby) ? pm25Color(r.pm25_nearby) : NO_PM25
    // Precision is stated in the popup, not implied by dot size alone.
    const precTh = r.pin_precision === 2
      ? 'จุดที่ระบุชื่อสถานที่ชัดเจน'
      : 'จุดกึ่งกลางของจังหวัด (ไม่ใช่จุดที่รายงาน)'
    const precEn = r.pin_precision === 2
      ? 'named place — exact point'
      : 'province centroid — NOT the reported spot'
    const pmTh = Number.isFinite(r.pm25_nearby)
      ? `<span class="citizen-pop-pm" style="--air:${color}">PM2.5 ${Math.round(r.pm25_nearby)} µg/m³</span><span class="citizen-pop-dim"> · ${escapeHtml(tr('สถานีใกล้สุด', 'nearest station'))} ${r.pm25_km} km</span>`
      : `<span class="citizen-pop-dim">${escapeHtml(tr('ไม่มีสถานีวัดใกล้ — ไม่มีค่า PM2.5', 'no station within range — no PM2.5'))}</span>`
    const claims = Object.entries(r.claims ?? {}).filter(([, v]) => v).map(([k]) => {
      const m = CLAIM_META[k]
      return m ? `${m.icon} ${escapeHtml(tr(m.th, m.en))}` : k
    })
    return `<div class="citizen-pop">
      <div class="citizen-pop-head">
        <span class="citizen-pop-place">${escapeHtml(tr(r.place_name, r.place_name))}</span>
        ${cm ? `<span class="citizen-pop-claim">${cm.icon} ${escapeHtml(tr(cm.th, cm.en))}</span>` : ''}
      </div>
      <p class="citizen-pop-title">${escapeHtml(r.title_raw)}</p>
      <div class="citizen-pop-pm-row">${pmTh}</div>
      ${claims.length ? `<div class="citizen-pop-claims">${claims.join(' · ')}</div>` : ''}
      <div class="citizen-pop-prec ${r.pin_precision === 2 ? 'is-exact' : ''}">
        ${escapeHtml(tr(precTh, precEn))}
      </div>
      <a class="citizen-pop-src" href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(tr(r.credit_line, r.credit_line))} ↗
      </a>
    </div>`
  }

  function pinHtml(r) {
    const color = Number.isFinite(r.pm25_nearby) ? pm25Color(r.pm25_nearby) : NO_PM25
    const claim = primaryClaim(r.claims)
    const icon = claim ? CLAIM_META[claim].icon : '💬'
    // Hollow ring = province centroid. Filled = named point. A citizen can see
    // the difference before clicking.
    const exact = r.pin_precision === 2
    return `<span class="citizen-pin${exact ? ' is-exact' : ''}" style="--air:${color}">
      <i aria-hidden="true">${icon}</i>
    </span>`
  }

  function linePopup(r) {
    const kind = r.kind === 'smoke' ? tr('ควัน', 'smoke')
      : r.kind === 'burning' ? tr('การเผา', 'burning')
        : r.kind === 'haze' ? tr('ฝุ่น', 'haze') : tr('รายงาน', 'report')
    const msg = (r.message || '').trim() || tr('ส่งตำแหน่งมา โดยไม่มีข้อความ', 'sent a location, no message')
    return `<div class="citizen-pop">
      <div class="citizen-pop-head"><span class="citizen-pop-place">${escapeHtml(tr(r.province_th || '', r.province_en || r.province_th || ''))}</span>
        <span class="citizen-pop-claim">${escapeHtml(kind)}</span></div>
      <p class="citizen-pop-title">${escapeHtml(msg)}</p>
      <div class="citizen-pop-prec is-exact">${escapeHtml(tr('รายงานไลน์ที่ตรวจแล้ว — ไม่แสดงภาพหรือชื่อผู้ส่ง', 'Reviewed LINE note — the photo and the sender are not shown'))}</div>
    </div>`
  }

  async function load() {
    if (fetching) return
    fetching = true
    try {
      const [pressRes, lineRes] = await Promise.allSettled([
        fetch('/api/citizen-reports?limit=200'),
        fetch('/api/reports?limit=40'),
      ])
      if (pressRes.status !== 'fulfilled' || !pressRes.value.ok) throw new Error('citizen-reports')
      const body = await pressRes.value.json()
      reports = body.reports ?? []
      sources = body.sources ?? []
      note = body.note_en ?? ''
      let line = []
      if (lineRes.status === 'fulfilled' && lineRes.value.ok) {
        line = (await lineRes.value.json()).reports ?? []
      }
      group.clearLayers()
      for (const r of reports) {
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue
        const m = L.marker([r.lat, r.lng], {
          icon: L.divIcon({ className: 'citizen-pin-shell', html: pinHtml(r), iconSize: [24, 24], iconAnchor: [12, 12] }),
          keyboard: false,
          zIndexOffset: Number.isFinite(r.pm25_nearby) && r.pm25_nearby > 75 ? 400 : 0,
          alt: tr(r.title_raw, r.title_raw),
        })
        m.bindPopup(() => popupHtml(r), { className: 'citizen-popup-shell', maxWidth: 320, minWidth: 240 })
        m.addTo(group)
      }
      for (const r of line) {
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue
        const m = L.marker([r.lat, r.lng], {
          icon: L.divIcon({
            className: 'citizen-pin-shell',
            html: `<span class="citizen-pin is-exact" style="--air:${NO_PM25}"><i aria-hidden="true">✉</i></span>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          }),
          keyboard: false,
          zIndexOffset: 450,
          alt: tr('รายงานไลน์', 'LINE report'),
        })
        m.bindPopup(() => linePopup(r), { className: 'citizen-popup-shell', maxWidth: 320, minWidth: 220 })
        m.addTo(group)
      }
      dispatchEvent(new CustomEvent('citizen-layer', { detail: { count: reports.length + line.length, sources } }))
    } catch (e) {
      console.warn('citizen layer failed', e)
    } finally {
      fetching = false
    }
  }

  function start() {
    if (timer) return
    load()
    timer = setInterval(load, REFRESH_MS)
  }
  function stop() { if (timer) { clearInterval(timer); timer = null } }

  return {
    id: 'citizen',
    group,
    start,
    stop,
    onAdd: start,
    onRemove: stop,
    legend: () => [
      { color: NO_PM25, label: tr('รายงานที่ยังไม่มีสถานีวัดใกล้', 'report with no station in range') },
      { color: 'transparent', hollow: true, label: tr('วงกลมโปร่ง = จุดกึ่งกลางจังหวัด', 'hollow ring = province centroid') },
      { color: 'transparent', filled: true, label: tr('จุดเต็ม = สถานที่ที่ระบุชื่อ', 'filled = named place') },
    ],
    sources: () => sources,
  }
}
