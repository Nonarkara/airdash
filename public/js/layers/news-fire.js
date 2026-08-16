// News/fire markers — pins pollution-related headlines (open burning,
// wildfire, hotspots, or any other AQI news) at the province they name, so
// "why is the air bad here" has an answer right on the map, not just in the
// scrolling news panel. This is the gap a plain AQI dashboard leaves: a
// number tells you WHAT the air is doing, a pinned headline can tell you
// WHY (a specific fire, a specific event) — see server/causes.js for the
// systematic version of the same idea.
//
// Marker is always RED (the categorical "there's a pollution-news event
// here" signal — a flame for confirmed open-burning/wildfire headlines, a
// warning triangle for other pollution news), with a small badge showing
// the CURRENT PM2.5 reading for that same place, colour-coded through the
// same Thai AQI palette the station dots use — so a glance answers both
// "is there a fire story here" and "how bad is it actually right now".
//
// Geotagging is best-effort (server/provinces.js matchProvinceInText — a
// province-name substring match against the headline), so this only ever
// shows a SUBSET of the news feed: headlines that name a single place. The
// full, ungeotagged feed stays in the NEWS panel.
import { tr } from '../i18n.js?v=2.4.14'
import { ago, escapeHtml } from '../fmt.js?v=2.4.14'
import { popupHtml, pm25Color } from '../paint.js?v=2.4.14'

export function createNewsFireLayer() {
  const group = L.layerGroup([], { pane: 'data' })

  /**
   * @param {Array} news - snapshot.news rows (already carry province_code/
   *   th/en, lat, lng, is_fire from the server geotag).
   * @param {Array} provinces - snapshot.risk.provinces, for the live PM2.5
   *   reading at that same place (news_items doesn't store its own PM2.5 —
   *   it should show what the air is doing NOW, not at ingest time).
   */
  function setData(news, provinces) {
    group.clearLayers()
    if (!news?.length) return

    const pm25ByProvince = new Map()
    for (const p of provinces ?? []) pm25ByProvince.set(p.province_code, p)

    // One marker per province — the most recent geotagged headline for that
    // place wins (news is already ordered newest-first by the API/snapshot
    // query), so the map doesn't sprout a dozen overlapping pins for one
    // ongoing story.
    const seen = new Set()
    for (const n of news) {
      if (!n.province_code || n.lat === null || n.lng === null) continue
      if (seen.has(n.province_code)) continue
      seen.add(n.province_code)

      const prov = pm25ByProvince.get(n.province_code)
      const pm25 = prov?.pm25 ?? null
      const icon = n.is_fire ? '🔥' : '⚠'
      const badge = pm25 !== null
        ? `<span class="newsfire-pm" style="background:${pm25Color(pm25)}">${Math.round(pm25)}</span>`
        : ''

      const marker = L.marker([n.lat, n.lng], {
        icon: L.divIcon({
          className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: `<div class="newsfire-pin${n.is_fire ? ' is-fire' : ''}">${icon}${badge}</div>`,
        }),
        zIndexOffset: 600, // above station dots/badges so a fire pin is never buried
        pane: 'data',
      })

      const safeLink = n.link && /^https?:\/\//i.test(n.link) ? n.link : null
      const linkRow = safeLink
        ? `<a href="${safeLink}" target="_blank" rel="noopener" class="newsfire-link">${tr('อ่านข่าว', 'Read article')} →</a>`
        : ''
      marker.bindPopup(() =>
        popupHtml(n.title, n.title_en ?? n.title, [
          [tr('จังหวัด', 'Province'), tr(n.province_th, n.province_en ?? n.province_th)],
          [tr('PM2.5 ตอนนี้', 'PM2.5 now'), pm25 !== null ? `${Math.round(pm25)} µg/m³` : '—'],
          [tr('เวลาข่าว', 'Published'), ago(n.published_at ?? n.fetched_at)],
        ]) + linkRow)
      marker.bindTooltip(() => `${icon} ${escapeHtml(tr(n.province_th, n.province_en ?? n.province_th))}`,
        { direction: 'top', offset: [0, -10] })
      marker.addTo(group)
    }
  }

  return { group, setData }
}
