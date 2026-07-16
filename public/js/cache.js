// Client-side TTL cache + concurrent-request coalescing + stale-while-error.
// Adapted from the unl-city-hub playbook: serves fresh data instantly, folds
// concurrent callers into one network request, and falls back to stale data if
// a refetch fails — so a flaky moment never blanks a panel.
const cache = new Map()    // key → { data, ts }
const inflight = new Map() // key → Promise

export async function cachedFetch(key, fetcher, ttlMs) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data

  const pending = inflight.get(key)
  if (pending) return pending

  const p = fetcher()
    .then((data) => { cache.set(key, { data, ts: Date.now() }); inflight.delete(key); return data })
    .catch((err) => {
      inflight.delete(key)
      const stale = cache.get(key)
      if (stale) return stale.data
      throw err
    })
  inflight.set(key, p)
  return p
}

export async function getJson(url, ttlMs = 30_000) {
  return cachedFetch(url, async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return res.json()
  }, ttlMs)
}

/** Fire-and-forget warm of a URL, so a later getJson is instant. */
export function prefetch(url, ttlMs = 30_000) {
  getJson(url, ttlMs).catch(() => {})
}
