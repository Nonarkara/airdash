// Focus switcher — populates the (optional) header dropdown from the
// /api/focus manifest. Selecting an area flies the map and (when it names
// a province) scopes the ranking rail to that province's stations. The
// header dropdown may or may not be present depending on the top bar
// layout — when it's not, the focus still works: the city-picker grid
// in the city-dashboard panel emits the same 'focus' event, and the
// URL state sync keeps the deep-link mechanism alive.
//
// URL state sync (?city=ID) — the dashboard is shareable. A deep link
// like /?city=chiangmai loads that city on first paint; selections
// update the URL via history.replaceState (no full reload, no
// back-button clutter).
import { getJson } from '../cache.js?v=2.4.17'
import { store, on, emit } from '../state.js?v=2.4.17'
import { showProvinceDetail, hideDetail } from './detail.js?v=2.4.17'

let areas = []
let initialised = false
let mapRef = null

/**
 * Public focus entry for panels without a map reference (the city-picker
 * grid). Flies the map, scopes the rails, syncs the dropdown + URL —
 * the exact path the header dropdown takes. Before this existed the
 * grid emitted the bare 'focus' EVENT, which notified listeners but
 * never called applyFocus — so "Tap a city to fly there" loaded the
 * city dashboard without ever moving the map.
 */
export function focusById(id) {
  if (!mapRef) return
  const sel = document.getElementById('focus-select')
  if (sel) sel.value = id
  applyFocus(id, mapRef, { source: 'grid' })
}

export async function initFocus(map) {
  mapRef = map
  // Both elements are optional — the top bar v2 stripped the focusbox,
  // and the focus mechanism is now driven by the city-picker grid in
  // city-dashboard.js. We still look for them so a future header that
  // re-adds the dropdown works without any change here.
  const sel = document.getElementById('focus-select')
  const back = document.getElementById('back-to-thailand')
  try {
    const data = await getJson('/api/focus', 3600_000)
    areas = data.areas
  } catch { return }

  const paint = () => {
    // Defensive: if the header dropdown was removed, skip the population
    // (the city-picker grid in city-dashboard.js is the primary UI).
    if (!sel) return
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

  if (sel) {
    sel.addEventListener('change', () => applyFocus(sel.value, map, { source: 'dropdown' }))
  }

  // Back-to-Thailand pill (optional). Click → return to the country
  // overview, fire the focus event, collapse the province detail so
  // the ranking + analytics panels are restored.
  if (back) {
    back.addEventListener('click', () => {
      if (sel) {
        sel.value = 'thailand'
        sel.dispatchEvent(new Event('change'))
      }
      hideDetail()
    })
  }

  // Initial focus: if the URL has ?city=X, load that city on first paint.
  // Falls back to 'thailand' for the all-Thailand overview. Fires only
  // once — subsequent navigations go through the dropdown, the city-picker
  // grid, or the URL listener below.
  if (!initialised) {
    initialised = true
    const urlCity = new URL(window.location.href).searchParams.get('city')
    const startId = areas.find((a) => a.id === urlCity) ? urlCity : 'thailand'
    if (sel) sel.value = startId
    applyFocus(startId, map, { source: 'url' })
  }

  // Keep the URL in sync with whatever the user picks — even when they
  // came in via a deep link, a click on the dropdown updates the URL so
  // the page can be bookmarked or shared in its current state.
  on('focus', (area) => {
    const url = new URL(window.location.href)
    if (area?.id && area.id !== 'thailand') url.searchParams.set('city', area.id)
    else url.searchParams.delete('city')
    window.history.replaceState({}, '', url)
  })
}

// Show the "← All Thailand" pill only when the user is currently focused on
// a non-Thailand area. Keeps the header clean by default; surfaces the
// escape hatch only when the user might need it.
function syncBackButton(sel, back) {
  if (!back || !sel) return
  const isCity = sel.value && sel.value !== 'thailand'
  back.hidden = !isCity
}

function applyFocus(id, map, { source = 'programmatic' } = {}) {
  const area = areas.find((a) => a.id === id)
  if (!area) return
  // Skip the flyTo on the initial URL-driven load if we're already at
  // roughly the right view (avoids the camera jumping on a refresh).
  // The dropdown always flies.
  if (source !== 'url' || !store.activeArea) {
    map.flyTo(area.center, area.zoom, { duration: source === 'url' ? 0 : 1.0, essential: true })
  }
  // Track the current area on the store so other panels (top-bar danger
  // chip, city dashboard) can scope themselves without re-fetching.
  store.activeArea = area
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
