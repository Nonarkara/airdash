// FloodDash's camera wall as haze eyes — a stable, health-checked panel.
//
// WHY. FloodDash (same Mac, :8340) already catalogues 3,429 public cameras for
// its flood wall; 2,677 of them are plain JPEG snapshots (maholan 2,494, DWR
// 130, Pak Kret 52) covering all 77 provinces — including the northern haze
// belt (Chiang Mai, Lampang, Chiang Rai, Nan, Tak) where AirDash's own HLS
// cameras are mostly down. The haze reader (hazeSignal.assessHaze) judges each
// camera only against ITS OWN clear-day baseline at a similar hour, so what
// matters is seeing the SAME cameras repeatedly — a rotating sample never
// builds a baseline. Hence a panel: up to PER_PROVINCE cameras per province,
// chosen deterministically, and kept unless they keep failing.
//
// POLITENESS. maholan.net is a hobbyist aggregator and FloodDash deliberately
// fetches its images only on popup open. We read a bounded panel (≤ ~230
// cameras), hourly, daylight only, ≤ 2 requests in flight per host — about
// 2–3k small JPEGs a day across all hosts. `floodbkk-*` rows (Bangkok BMA via a
// third-party proxy) are skipped: they time out and duplicate BMA's own feed.
// DWR images go through FloodDash's local proxy, never back out via Cloudflare.
import { pointInThailand } from '../geo/pointInThailand.js'
import { provinceByName } from '../provinces.js'
import { fetchJson, log } from '../util.js'

const FLOODDASH = process.env.FLOODDASH_LOCAL ?? 'http://127.0.0.1:8340'
const CATALOG_TTL_MS = 6 * 3600_000
export const PER_PROVINCE = 3
const FAIL_BENCH = 3                 // consecutive failures → benched
const BENCH_RETRY_MS = 24 * 3600_000 // a benched camera is retried after a day
const SKIP_ID = /^floodbkk-/

let catalog = { at: 0, cams: [] }
const provinceCache = new Map() // camera key → { code, th, en } | null

/** Pure: is this FloodDash camera usable as a haze panel member? */
export function usableSnapshotCam(c) {
  return !!(c?.snapshot_url && Number.isFinite(c.lat) && Number.isFinite(c.lng) && !SKIP_ID.test(String(c.id ?? '')))
}

/** Pure: point DWR snapshots at FloodDash locally (they proxy through it). */
export function localGrabUrl(url, base = FLOODDASH) {
  const m = /^https?:\/\/flood\.nonarkara\.org(\/api\/cctv\/dwr\?.*)$/.exec(url ?? '')
  return m ? `${base}${m[1]}` : url
}

export function provinceOf(key, lat, lng) {
  if (!provinceCache.has(key)) {
    const hit = pointInThailand(lat, lng)
    const reg = hit.inThailand ? provinceByName(hit.province_th, hit.province_en) : null
    provinceCache.set(key, reg ? { code: reg.province_code, th: reg.province_th, en: reg.province_en } : null)
  }
  return provinceCache.get(key)
}

/** FloodDash's snapshot cameras, normalised for grabMany, with a province. */
export async function floodWallCameras() {
  if (Date.now() - catalog.at < CATALOG_TTL_MS && catalog.cams.length) return catalog.cams
  try {
    const j = await fetchJson(`${FLOODDASH}/api/cctv/all`, { timeoutMs: 30_000 })
    const cams = []
    for (const c of j?.cameras ?? []) {
      if (!usableSnapshotCam(c)) continue
      const key = `fw-${c.source}:${c.id}`
      const prov = provinceOf(key, c.lat, c.lng)
      if (!prov) continue
      cams.push({
        id: `${c.source}:${c.id}`, source: `fw-${c.source}`, lat: c.lat, lng: c.lng,
        name_th: c.name_th, name_en: c.name_en,
        stream_kind: 'snapshot', grab_url: localGrabUrl(c.snapshot_url),
        province_code: prov.code, province_th: prov.th, province_en: prov.en,
      })
    }
    catalog = { at: Date.now(), cams }
  } catch (err) {
    // FloodDash down: keep the last catalogue; the panel degrades, never throws.
    log('warn', 'flood-wall catalogue unavailable', { error: String(err?.message ?? err) })
  }
  return catalog.cams
}

/** Pure: deterministic per-province panel. health: key → { ok, fails, last_try }. */
export function choosePanel(cams, health, { perProvince = PER_PROVINCE, now = Date.now() } = {}) {
  const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
  const byProv = new Map()
  for (const c of cams) {
    const key = `${c.source}:${c.id}`
    const h = health.get(key) ?? { ok: 0, fails: 0, last_try: 0 }
    const benched = h.fails >= FAIL_BENCH && now - h.last_try < BENCH_RETRY_MS
    if (benched) continue
    const list = byProv.get(c.province_code) ?? []
    list.push({ c, rank: [h.fails > 0 ? 1 : 0, -h.ok, hash(key)] })
    byProv.set(c.province_code, list)
  }
  const out = []
  for (const list of byProv.values()) {
    list.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2])
    out.push(...list.slice(0, perProvince).map((x) => x.c))
  }
  return out
}

/** Grab-health bookkeeping for panel cameras (survives restarts). */
export function loadHealth(db) {
  const m = new Map()
  for (const r of db.all('SELECT camera_key, ok, fails, last_try FROM vision_cam_health')) {
    m.set(r.camera_key, { ok: r.ok, fails: r.fails, last_try: Date.parse(r.last_try) || 0 })
  }
  return m
}

export function recordHealth(db, results) {
  const now = new Date().toISOString()
  db.tx(() => {
    for (const { key, ok } of results) {
      db.run(`INSERT INTO vision_cam_health (camera_key, ok, fails, last_try) VALUES (?, ?, ?, ?)
              ON CONFLICT(camera_key) DO UPDATE SET
                ok = ok + excluded.ok,
                fails = CASE WHEN excluded.ok > 0 THEN 0 ELSE fails + 1 END,
                last_try = excluded.last_try`, key, ok ? 1 : 0, ok ? 0 : 1, now)
    }
  })
}
