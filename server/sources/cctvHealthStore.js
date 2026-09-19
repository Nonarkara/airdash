// Shared, tiny store for CCTV stream health. Kept apart from cctvHealth.js so
// the registry (which APPLIES health) and the source (which PRODUCES it)
// don't import each other.
export const KV_KEY = 'cctv_health_v1'

let health = new Map() // "source:id" -> { status, fail_streak, last_ok_at, checked_at }
let hydrated = false
let checkedAt = null

export const keyOf = (c) => (c.source ? `${c.source}:${c.id}` : c.id)

export const getHealth = () => health
export const getCheckedAt = () => checkedAt

export function setHealth(map, at = new Date().toISOString()) {
  health = map
  checkedAt = at
  hydrated = true
}

/** Load the last saved result once per process so a restart does not forget which cameras are dead. */
export function hydrateOnce(db) {
  if (hydrated) return
  hydrated = true
  try {
    const raw = db.kvGet(KV_KEY)
    const saved = raw ? JSON.parse(raw) : null
    if (saved?.cameras) { health = new Map(Object.entries(saved.cameras)); checkedAt = saved.checked_at ?? null }
  } catch { /* an unreadable cache is just "unknown" until the next probe */ }
}

export function __resetForTests() { health = new Map(); hydrated = false; checkedAt = null }

/** Overlay health on the catalog. Pure: returns new objects. */
export function applyHealth(cams, healthMap, keyFn = keyOf) {
  return cams.map((c) => {
    if (!c.hls_url) return { ...c, stream_status: 'embed' }
    const h = healthMap.get(keyFn(c))
    if (!h) return { ...c, stream_status: 'unknown' }
    return { ...c, stream_status: h.status, online: c.online && h.status !== 'down' }
  })
}

export function summarize(cams) {
  const out = { live: 0, flaky: 0, down: 0, unknown: 0, embed: 0, total: cams.length }
  for (const c of cams) if (c.stream_status in out) out[c.stream_status]++
  return out
}

