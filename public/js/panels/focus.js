// Focus switcher — populates the header dropdown from the /api/focus manifest.
// Selecting an area flies the map and (when it names a province) scopes the
// ranking rail to that province's stations. Adding a city is a server-side
// one-liner in focus.js; this UI needs no change.
import { getJson } from '../cache.js?v=2.0.0-final'
import { store, on, emit } from '../state.js?v=2.0.0-final'
import { showProvinceDetail, hideDetail } from './detail.js?v=2.0.0-final'

let areas = []

export async function initFocus(map) {
  const sel = document.getElementById('focus-select')
  const back = document.getElementById('back-to-thailand')
  try {
    const data = await getJson('/api/focus', 3600_000)
    areas = data.areas
  } catch { return }

  const paint = () => {
    sel.replaceChildren(...areas.map((a) => {
      const o = document.createElement('option')
      o.value = a.id
      o.textContent = store.lang === 'th' ? a.name_th : a.name_en
      return o
    }))
    syncBackButton(sel, back)
  }
  paint()
  on('lang', paint)

  sel.addEventListener('change', () => applyFocus(sel.value, map))

  // Back-to-Thailand: one-click way out of any city view. The dropdown
  // alone wasn't discoverable enough — a visible pill in the header makes
  // it obvious how to return to the all-Thailand overview.
  if (back) {
    back.addEventListener('click', () => {
      sel.value = 'thailand'
      sel.dispatchEvent(new Event('change'))
      // Also collapse any province drill-down on the left rail so the
      // country overview (ranking + analytics) is fully restored.
      hideDetail()
    })
  }
}

// Show the "← All Thailand" pill only when the user is currently focused on
// a non-Thailand area. Keeps the header clean by default; surfaces the
// escape hatch only when the user might need it.
function syncBackButton(sel, back) {
  if (!back || !sel) return
  const isCity = sel.value && sel.value !== 'thailand'
  back.hidden = !isCity
}

function applyFocus(id, map) {
  const area = areas.find((a) => a.id === id)
  if (!area) return
  map.flyTo(area.center, area.zoom, { duration: 1.0, essential: true })
  emit('focus', area)
  syncBackButton(document.getElementById('focus-select'), document.getElementById('back-to-thailand'))
  // If the area maps to a province, drill the left rail into it.
  if (area.province_th && store.snapshot?.risk) {
    const p = store.snapshot.risk.provinces.find((x) => x.province_th === area.province_th)
    if (p) showProvinceDetail(p)
  }
  // If we're returning to the country view, collapse the province detail
  // so the ranking (and its national verdict banner) is back in place.
  if (area.id === 'thailand') hideDetail()
}

export function focusAreas() { return areas }
