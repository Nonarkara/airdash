// Shared sensor-health fetch — one cached call feeds header, insights,
// sources, and province detail warnings.
import { getJson } from './cache.js?v=2.4.21'
import { store, emit } from './state.js?v=2.4.21'

const TTL_MS = 60_000
let lastFetch = 0

export async function refreshSensorHealth(force = false) {
  const now = Date.now()
  if (!force && now - lastFetch < TTL_MS && store.sensorHealth) return store.sensorHealth
  lastFetch = now
  const data = await getJson('/api/sensors/health', TTL_MS)
  store.sensorHealth = data
  emit('sensor-health', data)
  return data
}

export function provinceHealth(code) {
  if (!code || !store.sensorHealth) return null
  return store.sensorHealth.by_province?.find((p) => String(p.province_code) === String(code)) ?? null
}

export function openInsightsPane() {
  // Sync tab button visual + ARIA state (must match selectPane in main.js).
  const tabBtns = document.querySelectorAll('#righttabs button')
  const panes = document.querySelectorAll('#rail-right .tabpane')
  tabBtns.forEach((b) => {
    const isActive = b.dataset.pane === 'insights'
    b.classList.toggle('active', isActive)
    b.setAttribute('aria-selected', isActive ? 'true' : 'false')
    b.tabIndex = isActive ? 0 : -1
  })
  panes.forEach((p) => {
    const isActive = p.dataset.pane === 'insights'
    p.classList.toggle('active', isActive)
    p.hidden = !isActive
  })
  const mobile = window.matchMedia('(max-width: 860px)').matches
  if (mobile) {
    document.getElementById('rail-left')?.classList.remove('sheet-active')
    document.getElementById('rail-right')?.classList.add('sheet-active')
    document.querySelectorAll('#sheettabs button').forEach((b) =>
      b.classList.toggle('active', b.dataset.sheet === 'insights'))
  }
}
