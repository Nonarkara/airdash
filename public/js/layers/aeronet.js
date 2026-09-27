// AERONET ground-truth stations on the map. The other "ground" layer
// (air4thai stations) shows regulatory-grade PM2.5 measurements; this
// one shows the only DIRECT aerosol optical depth measurement on the
// dashboard — AERONET sunphotometers point straight at the sun and
// measure column AOD at multiple wavelengths. It is the cross-check
// that keeps the satellite AOD layers honest.
//
// Markers are small (8 px) and labelled with the most recent 440 nm
// AOD rounded to 2 decimals — AOD 0.18 reads as ".18" so the number is
// visible at city zoom without crowding out the air4thai pins. A
// missing reading renders as "—" so a station that has gone offline
// is honest about it (vs. silently rendering zero).
// AERONET colour scale mirrors the satellite AOD gradient but
// inverted at the bottom: 0.0–0.10 = clear, 0.10–0.30 = light haze,
// 0.30+ = thick haze. Anything above 1.0 (extremely rare) is a plume
// — render dark red so it pops against the map.
function aodColor(v) {
  if (v == null || Number.isNaN(v)) return '#6b6b6b'
  if (v < 0.05) return '#7be3c0'
  if (v < 0.15) return '#a4d36a'
  if (v < 0.30) return '#f5b13b'
  if (v < 0.60) return '#e85a4f'
  return '#a51931'
}

export function createAeronetLayer() {
  // Group lives in the data pane so it draws above satellite imagery
  // but below vector overlays.
  const group = L.layerGroup()
  group._airdashKind = 'aeronet'

  let stations = []
  let latest = {}

  function render() {
    group.clearLayers()
    if (!stations.length) return
    for (const s of stations) {
      const r = latest[s.code]
      const aod440 = r?.aod_440 ?? null
      const ageH = r?.ts ? Math.max(0, (Date.now() - new Date(r.ts).getTime()) / 3.6e6) : null

      // Small circle marker with the AOD colour, plus a label badge with
      // the AOD value. Two SVGs share the same lat/lng anchor via a
      // Leaflet divIcon so they stay in lockstep when the map moves.
      const icon = L.divIcon({
        className: 'aeronet-pin',
        html: `
          <div class="aeronet-marker" style="background:${aodColor(aod440)}"></div>
          <div class="aeronet-label" style="border-color:${aodColor(aod440)}">
            ${aod440 == null ? '—' : aod440.toFixed(2)}
          </div>`,
        iconSize: [42, 22],
        iconAnchor: [21, 11],
      })

      const popup = `
        <div class="aeronet-popup">
          <div class="aeronet-popup-name">${s.th} · <span class="muted">${s.en}</span></div>
          <div class="aeronet-popup-line"><b>AERONET</b> ground sunphotometer</div>
          <div class="aeronet-popup-line">440 nm AOD: <b>${aod440 == null ? '—' : aod440.toFixed(3)}</b></div>
          <div class="aeronet-popup-line">500 nm AOD: <b>${r?.aod_500 == null ? '—' : r.aod_500.toFixed(3)}</b></div>
          <div class="aeronet-popup-line">675 nm AOD: <b>${r?.aod_675 == null ? '—' : r.aod_675.toFixed(3)}</b></div>
          <div class="aeronet-popup-line">Precipitable water: <b>${r?.precipitable_water_cm == null ? '—' : r.precipitable_water_cm.toFixed(2)} cm</b></div>
          <div class="aeronet-popup-line muted">last: ${r?.ts ?? 'no reading'} ${ageH != null ? `(${ageH.toFixed(0)} h ago)` : ''}</div>
        </div>`

      L.marker([s.lat, s.lng], { icon, riseOnHover: true })
        .bindPopup(popup)
        .addTo(group)
    }
  }

  async function refresh() {
    try {
      const res = await fetch('/api/aeronet?days=2', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = await res.json()
      stations = r.stations ?? []
      latest = r.latest ?? {}
      render()
    } catch (e) {
      console.error('aeronet refresh failed:', e)
    }
  }

  return {
    group,
    refresh,
    onAdd: refresh,
    onRemove() { group.clearLayers() },
  }
}
