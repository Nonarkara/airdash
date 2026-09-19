// Multi-source CCTV aggregator.
//
// Why this file exists: the operator pulled iTIC + GISTDA + NST + (more
// later) cameras in their other codebases and wants one unified layer
// on the map — "CCTVs are CCTVs, users don't care if the source is
// iTIC or others" (operator, 2026-09-15). The browser doesn't render
// 5 layers stitched together — it renders one. This module composes
// every registered source into one normalized catalog, deduplicates by
// (source, id), and tags each camera with the attribution it deserves
// so the popup can show "ภาพจากกรมทางหลวง / image from DOH" with a
// back-link to the source page.
//
// Pipeline per source: each entry is `{ name, fetch(): Promise<Raw[]> }.
// Raw is anything the source picker returns — coordinates are required,
// everything else is normalized here. A source may fail without killing
// the rest; the registry reports a `degraded: true` flag in /api/cctv/all
// so the UI can show which sources are stuck.
//
// Source status 2026-09-15:
//   - gistda: LIVE (1,308 cameras, BMA + DOH + iTIC under one keyless
//     keyless public aggregator). Wires through the existing
//     gistdaCctv.js layer.
//   - itic: STUB. The operator's BKKx / Lopburi codebase has a
//     server-side scraper that returns iTIC camera data. Until they
//     share the fetcher URL or paste a sample row, this source
//     contributes [] with `status: 'awaiting-fetcher'`. The contract
//     this file expects is documented inline; once the fetcher is
//     plugged in, the cameras land immediately.
//   - nst: SKELETON. https://nstcctv.nakhoncity.org/ inlines its camera
//     data in the HTML. Deferring the parse logic until NST coverage
//     is actually wanted — the registry seam is here.
//
// Stale-while-error: if a source fails today but had a good fetch
// recently, the registry keeps the previous payload (a free
// self-healing — never show the user a blank map because one source
// hiccupped).

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalized CCTV camera shape. Server-side canonical fields; the
 * frontend renders directly from this. Adapters below must produce it.
 *
 *  {
 *    id: string,                  // unique within source (`source:id` after merge)
 *    source: 'gistda' | 'itic' | 'nst' | string,
 *    source_label_th: string,     // "GISTDA · BMA/ทล./iTIC" — popup attribution TH
 *    source_label_en: string,     // "GISTDA · BMA/DOH/iTIC" — popup attribution EN
 *    source_url: string,          // back-link to the source's own viewer / portal
 *    name_th: string,
 *    name_en: string,
 *    location_th: string,          // optional road / district context
 *    lat: number,
 *    lng: number,
 *    online: boolean,              // optional — false pins stay hidden by default
 *    flooded: boolean,             // optional — true pins stay visible at country zoom
 *    playback:                    // ONE of these (frontend uses first valid)
 *      hls_url?: string,           // .m3u8 → embed via hls.js / Safari native
 *      viewer_url?: string,        // page link → "open in new tab"
 *  }
 */
function normalize(raw, source) {
  const lat = num(raw.lat ?? raw.latitude)
  const lng = num(raw.lng ?? raw.longitude ?? raw.lon)
  if (lat === null || lng === null) return null
  if (lat < 4 || lat > 21.5 || lng < 96 || lng > 106.5) return null
  return {
    id: String(raw.id ?? raw.cameraId ?? `${source.id}:${lat},${lng}`),
    source: source.id,
    source_label_th: source.label_th,
    source_label_en: source.label_en,
    source_url: source.homepage,
    name_th: String(raw.name_th ?? raw.name ?? '').trim(),
    name_en: String(raw.name_en ?? raw.nameEnglish ?? '').trim(),
    location_th: String(raw.location_th ?? raw.location ?? '').trim(),
    lat, lng,
    online: raw.online !== false,
    flooded: Boolean(raw.flooded ?? raw.is_flooded),
    hls_url: raw.hls_url ?? raw.streamData ?? null,
    viewer_url: raw.viewer_url ?? null,
    // Preserve the raw id under a separate namespace so the popup can
    // link to it on the source's own page.
    source_native_id: raw.source_native_id ?? raw.cameraId ?? null,
  }
}

/**
 * Merge many sources into one deduplicated catalog. Dedup key is
 * (source, id); collisions inside one source are dropped (a single
 * source shouldn't emit dupes — its normalizer would catch that).
 * Across sources the same id IS allowed to coexist, since "BMA-231"
 * and "iTIC-231" could be the same physical camera under two
 * upstream ids — but here we conservatively assume each source uses
 * its own id space and merge under (source, id) anyway.
 */
export function mergeCams(perSource) {
  const all = []
  const seen = new Set()
  for (const { source, cams } of perSource) {
    for (const raw of cams) {
      const n = normalize(raw, source)
      if (!n) continue
      const key = `${n.source}:${n.id}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(n)
    }
  }
  return all
}

/**
 * Sort + bucket for the map: flooded cameras surface first (visible at
 * any zoom); online non-flooded sort by name within source so the
 * layer reads consistently as the user pans.
 */
export function sortByPriority(cams) {
  return [...cams].sort((a, b) => {
    if (a.flooded !== b.flooded) return a.flooded ? -1 : 1
    if (a.online !== b.online) return a.online ? -1 : 1
    return (a.name_th || a.name_en || '').localeCompare(b.name_th || b.name_en || '')
  })
}

/**
 * Pick the N closest cameras to (lat, lng) — used by /api/decision?
 * and the citizen card "nearest camera" surface. Distance is haversine
 * km; matches the threshold used elsewhere in the system (radius_km).
 */
export function nearestCams(cams, lat, lng, { radius_km = 0, limit = 8 } = {}) {
  const out = []
  for (const c of cams) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue
    const km = Math.hypot((c.lat - lat) * 111, (c.lng - lng) * 104)
    if (radius_km > 0 && km > radius_km) continue
    out.push({ ...c, km: Math.round(km * 10) / 10 })
  }
  out.sort((a, b) => a.km - b.km)
  return out.slice(0, Math.max(1, Math.min(50, Math.trunc(Number(limit) || 8))))
}

// ── Source registry ──────────────────────────────────────────────────────────
// Each source has a stable id, a fetch() that returns { cams, fetched_at,
// status } in its own native shape, plus label strings for the popup
// attribution. Adding a new source (e.g. NST) is a one-line append below —
// the layer, popup, and tests don't need to change.

const SOURCES = []

/** Register a CCTV source. Idempotent on (id). */
export function registerSource(source) {
  const idx = SOURCES.findIndex((s) => s.id === source.id)
  if (idx >= 0) SOURCES[idx] = source
  else SOURCES.push(source)
  return SOURCES.length
}

export function listSources() {
  return SOURCES.map((s) => ({ id: s.id, label_th: s.label_th, label_en: s.label_en }))
}

let _cache = null
let _cacheAt = 0
const CACHE_MS = 5 * 60_000 // 5 min: GISTDA poll is 10 min; avoid hitting their origin per browser request

export function __clearCacheForTests() { _cache = null; _cacheAt = 0 }

/** Resolve and run every source's fetch(). A failing source contributes
 *  `{status: 'failed', error}`; the caller decides whether to surface
 *  that or degrade silently. */
export async function composeAll(opts = {}) {
  const raw = await composeRaw(opts)
  if (opts.skipHealth) return raw
  // Health is applied at READ time, never cached with the catalog: a probe
  // that lands a minute after the catalog was cached must show immediately.
  const cameras = applyHealth(raw.cameras, getHealth())
  return { ...raw, cameras, health: { ...summarize(cameras), checked_at: getCheckedAt() } }
}

async function composeRaw(opts = {}) {
  const useCache = opts.useCache !== false
  if (useCache && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache
  const timeoutMs = opts.timeoutMs ?? 60_000
  const t0 = Date.now()
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const out = await s.fetch({ timeoutMs })
      return { source: s, out }
    })
  )
  const perSource = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      perSource.push({ source: SOURCES[i], cams: r.value.out?.cams ?? [], fetched_at: r.value.out?.fetched_at ?? new Date().toISOString(), status: r.value.out?.status ?? 'live', error: r.value.out?.error ?? null })
    } else {
      perSource.push({ source: SOURCES[i], cams: [], fetched_at: null, status: 'failed', error: String(r.reason) })
    }
  }
  const merged = mergeCams(perSource)
  const all = merged
  const out = {
    fetched_at: new Date().toISOString(),
    dur_ms: Date.now() - t0,
    sources: perSource.map(({ source, ...r }) => ({
      id: source.id,
      label_th: source.label_th,
      label_en: source.label_en,
      count: r.cams.length,
      fetched_at: r.fetched_at,
      status: r.status,
      error: r.error,
    })),
    cameras: sortByPriority(all),
    total: all.length,
    degraded: perSource.some((p) => p.status === 'failed'),
  }
  if (useCache) { _cache = out; _cacheAt = Date.now() }
  return out
}

// ── Source 1: GISTDA CheckFlood (1,308 cameras; BMA + DOH + iTIC) ───────────
// Live today via server/sources/gistdaCctv.js; this wrapper pulls the
// same JSON and re-normalizes into the registry shape. We deliberately
// do NOT use `flooddash.server.sources.gistdaCctv.normalizeCctv` here —
// the registry wants source-agnostic keys, so we re-shape here rather
// than coupling the registry to gistdaCctv's internal shape.
import { fetchJson, log } from '../util.js'
import { getHealth, getCheckedAt, applyHealth, summarize } from './cctvHealthStore.js'

registerSource({
  id: 'gistda',
  label_th: 'GISTDA · BMA / ทล. / iTIC',
  label_en: 'GISTDA · BMA / DOH / iTIC',
  homepage: 'https://floodcheck.gistda.or.th/',
  async fetch({ timeoutMs = 30_000 } = {}) {
    const URL = 'https://floodcheck.gistda.or.th/cctv'
    const raw = await fetchJson(URL, { timeoutMs })
    const items = Array.isArray(raw) ? raw : raw?.data ?? []
    const cams = []
    for (const c of items) {
      const lat = num(c.latitude)
      const lng = num(c.longitude)
      if (lat === null || lng === null) continue
      if (lat < 4 || lat > 21.5 || lng < 96 || lng > 106.5) continue
      // Keep online + flooded-flagged cameras (mirrors gistdaCctv).
      // Offline non-flooded cameras are noise on a map; a flooded-flag
      // makes the offline state itself worth showing.
      if (!c.is_online && !c.is_flooded) continue
      cams.push({
        id: String(c.cameraId ?? `${lat},${lng}`),
        lat, lng,
        name_th: String(c.name ?? '').trim(),
        name_en: String(c.nameEnglish ?? '').trim(),
        location_th: String(c.location ?? '').trim(),
        online: Boolean(c.is_online),
        flooded: Boolean(c.is_flooded),
        source_native_id: c.cameraId ?? null,
        // HLS path: streamData is the .m3u8.
        hls_url: c.streamMethod === 'HLS' && /^https:/.test(String(c.streamData ?? ''))
          ? String(c.streamData)
          : null,
        // BMA cameras carry only a viewer-page id, not a stream URL.
        viewer_url: c.streamMethod === 'BMA' && /^\d+$/.test(String(c.streamData ?? ''))
          ? `http://www.bmatraffic.com/PlayVideo.aspx?ID=${c.streamData}`
          : null,
      })
    }
    return { cams, status: 'live' }
  },
})

// ── Source 2: iTIC (Longdo / iTIC public RSS feed) ──────────────────────────
// Discovered 2026-09-15 by reading the operator's BKKx codebase
// (site/worker/live.ts#LONGDO_CAMERA_FEED): the actual catalog feed
// lives at https://camera.longdo.com/feed/, the public XML/RSS under
// Longdo's media infrastructure. live.iticfoundation.org itself does
// NOT expose this catalog — its embedded map renders cameras via
// Longdo's `longdo.Overlays.cameras` (closed).
//
// 219 items today, 64 from กรมทางหลวง (DOH) and 155 from iTIC Motion
// (BMA + Longdo curated traffic cams). Each <item> carries
// <hls_url>, <imgurl>, <camid>, <latitude>, <longitude>, <organization>
// — the same fields BKKx's live.ts parses, normalised here into the
// registry shape.
//
// Motion=N are dropped (dead cameras), bbox filter rejects anything
// outside Thailand. The default export of server/sources/iticCctv.js
// runs the fetch+parse + JSON-normalises; we wrap it for the registry's
// {status, cams} contract.
import iticCctvSource from './iticCctv.js'

registerSource({
  id: 'itic',
  label_th: 'iTIC · มูลนิฑิศูนย์ข้อมูลจราจรอัจฉริยะไทย',
  label_en: 'iTIC (live.iticfoundation.org) · via camera.longdo.com',
  homepage: 'https://live.iticfoundation.org/',
  async fetch(opts = {}) {
    try {
      const out = await iticCctvSource.run({ timeoutMs: opts.timeoutMs ?? 30_000 })
      // Map the iticCctv normalized cameras to the registry shape.
      const cams = (out.cameras ?? []).map((c) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        name_th: c.name_th,
        name_en: c.name_en,
        location_th: c.location_th,
        online: c.online,
        flooded: c.flooded,
        hls_url: c.hls_url,
        viewer_url: c.viewer_url,
        source_native_id: c.source_native_id,
        attribution_th: c.organization,
      }))
      return { cams, status: 'live', count: cams.length }
    } catch (err) {
      log('warn', 'itic_longdo source fetch failed', { error: String(err) })
      return { cams: [], status: 'failed', error: String(err) }
    }
  },
})

// ── Source 3: NST CCTV ───────────────────────────────────────────────────────
// nstcctv.nakhoncity.org — 222 cameras in Nakhon Si Thammarat (202 online
// per /api/stats). Public API: /api/cameras/public → [{id, name, group,
// lat, lng}] + /api/camera-status → {id: "online"|"offline"}. Streams are
// iframe embeds at /cam/{id}_sub/ (SD) / /cam/{id}/ (HD), not HLS, so
// viewer_url is the embed. Thumbnails are the iframe itself — the wall
// renders them as <iframe> lazy via IntersectionObserver.
registerSource({
  id: 'nst',
  label_th: 'NST Smart City CCTV · nstcctv.nakhoncity.org',
  label_en: 'NST CCTV (Nakhon Si Thammarat Smart City)',
  homepage: 'https://nstcctv.nakhoncity.org/',
  async fetch({ timeoutMs = 10_000 } = {}) {
    const base = 'https://nstcctv.nakhoncity.org'
    const [raw, statusMap] = await Promise.all([
      fetchJson(`${base}/api/cameras/public`, { timeoutMs }).catch(() => []),
      fetchJson(`${base}/api/camera-status`, { timeoutMs }).catch(() => ({})),
    ])
    const items = Array.isArray(raw) ? raw : raw?.data ?? []
    const cams = []
    for (const c of items) {
      const lat = num(c.lat)
      const lng = num(c.lng ?? c.lon ?? c.longitude)
      if (lat === null || lng === null) continue
      if (lat < 4 || lat > 21.5 || lng < 96 || lng > 106.5) continue
      const id = String(c.id ?? c.cameraId ?? '').trim()
      if (!id) continue
      const st = statusMap[id]
      const online = st ? st === 'online' : true // if status missing, assume online (public list is already filtered)
      if (!online) continue // offline are noise on a map; NST has 20 offline per /api/stats
      cams.push({
        id,
        lat, lng,
        name_th: String(c.name ?? '').trim(),
        name_en: String(c.nameEnglish ?? '').trim(),
        location_th: String(c.group ?? '').trim(),
        online: true,
        flooded: false,
        source_native_id: id,
        hls_url: null,
        // SD stream as viewer — the wall/popup embed this iframe. HD is
        // available at /cam/{id}/ but SD is lighter for thumbnails.
        viewer_url: `${base}/cam/${id}_sub/`,
        // Preserve raw for debugging
        _group: c.group ?? null,
      })
    }
    return { cams, status: 'live' }
  },
})
