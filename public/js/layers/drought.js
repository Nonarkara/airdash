// GISTDA Check Drought (cropsdrought) overlay — province-level drought
// risk, weekly. A semi-transparent fill coloured by the risk score so
// the user can see at a glance which provinces are dry and therefore
// more likely to lift dust on the next gust.
//
// Why this exists alongside the burn-scar layer: drought and burning
// are the two main natural causes of haze in northern Thailand, and
// they COMPOUND. A wet province that burned last month tends to recover
// quickly; a drought-stressed province that burned last month keeps
// lifting dust for weeks. Showing both side-by-side lets the user see
// the combined risk.
//
// Data path: GET /api/drought returns GeoJSON MultiPolygon per province
// for the latest week. The polygons are province boundaries; the
// fill color carries the risk score (0-100). When the user clicks a
// province the popup shows the categorical Thai description
// ("โอกาสได้รับความเสี่ยง...") plus the absolute score.
import { tr } from '../i18n.js?v=2.4.33'

// Same colour philosophy as the AQI bands: low → sage, watch →
// amber, elevated → orange, high → brick. Score ranges here are
// mapped to 0-100, so the band thresholds match the citizen panel
// danger scale: <25 healthy, 25-50 watch, 50-75 elevated, 75+ high.
function droughtColor(mean) {
  if (mean == null) return '#9CA3AF'
  if (mean >= 75) return '#C8453A'    // high
  if (mean >= 50) return '#E86A10'    // elevated
  if (mean >= 25) return '#D8893A'    // watch
  return '#3A8A6E'                    // low (sage)
}

function droughtStroke(mean) {
  if (mean == null) return '#6B7280'
  if (mean >= 75) return '#7A1F2B'
  if (mean >= 50) return '#A04A0A'
  if (mean >= 25) return '#8A6D00'
  return '#1F6A52'
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function createDroughtLayer({ pane = 'data' } = {}) {
  const group = L.layerGroup([], { pane })
  let cache = null
  let inFlight = null

  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const res = await fetch('/api/drought', { cache: 'no-store' })
        if (!res.ok) throw new Error(`drought HTTP ${res.status}`)
        const data = await res.json()
        cache = data
        render(data)
      } catch (e) {
        console.warn('drought layer fetch failed:', e)
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  function render(data) {
    group.clearLayers()
    if (!data?.rows?.length) return

    const isEn = (document.documentElement.lang || 'th').toLowerCase().startsWith('en')
    const fmt = (n) => (n == null ? '—' : Number(n).toFixed(1))

    for (const r of data.rows) {
      const geom = r.geometry
      if (!geom) continue
      const fill = droughtColor(r.mean)
      const stroke = droughtStroke(r.mean)
      const layer = L.geoJSON(geom, {
        style: {
          color: stroke,
          weight: 1,
          opacity: 0.7,
          fillColor: fill,
          fillOpacity: 0.30,
          // Click-vs-hover hint: thicker outline when the cursor is on it.
          className: 'drought-province',
        },
        onEachFeature: (feature, l) => {
          const name = isEn ? (r.pv_en || r.pv_tn) : (r.pv_tn || r.pv_en)
          const des = r.des || (isEn ? 'Drought risk' : 'ความเสี่ยงภัยแล้ง')
          l.bindPopup(
            `<div style="min-width:180px">
              <div style="font-size:13px;font-weight:700;color:#0E4A5E">${escapeHtml(name || '')}</div>
              <div style="font-size:11px;color:#4A6273;margin-top:4px">${escapeHtml(des)}</div>
              <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
                <span style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${fill}">${fmt(r.mean)}</span>
                <span style="font-size:10px;color:#7E8E9A">/100 · ${escapeHtml(isEn ? data.week || '' : (data.week || '').slice(0,10))}</span>
              </div>
            </div>`,
          )
        },
      })
      group.addLayer(layer)
    }
  }

  return {
    group,
    refresh,
    // Test helper / direct access for the citizen-panel cause chip
    getCached: () => cache,
  }
}
