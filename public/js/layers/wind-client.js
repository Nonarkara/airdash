// One in-page fetch of /api/wind-field, shared by the particle layer and the
// haze drifts. The server caches Open-Meteo; this only avoids two layers
// asking twice, and it waits while the tab is hidden.

const STALE_MS = 25 * 60 * 1000
let field = null
let fetchedAt = 0
let inflight = null
let timer = null
const listeners = new Set()

async function pull() {
  if (typeof document !== 'undefined' && document.hidden) return field
  if (inflight) return inflight
  inflight = fetch('/api/wind-field')
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      fetchedAt = Date.now()
      if (json?.available && Array.isArray(json.speed_kmh)) {
        field = json
        for (const cb of listeners) cb(field)
      }
      return field
    })
    .catch(() => field)
    .finally(() => { inflight = null })
  return inflight
}

function ensureTimer() {
  if (timer || typeof window === 'undefined') return
  timer = window.setInterval(() => {
    if (!listeners.size || (typeof document !== 'undefined' && document.hidden)) return
    if (Date.now() - fetchedAt >= STALE_MS) pull()
  }, 60 * 1000)
}

export function onWindField(cb) {
  listeners.add(cb)
  ensureTimer()
  if (field) cb(field)
  else pull()
  return () => {
    listeners.delete(cb)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function currentWindField() {
  return field
}
