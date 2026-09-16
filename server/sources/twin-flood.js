// FloodDash — the twin system's per-province flood verdict (docs/TWIN-API.md).
//
// AirDash and FloodDash run on the same Mac, poll seven of the same upstreams,
// and score the same 77 provinces — one for the air, one for too much water.
// This source relays FloodDash's /api/twin into kv so risk.js can attach a
// `flood` block to every province and verdict.js can say the one thing the
// air side alone cannot: the rain the washout engine counts as RELIEF is the
// same rain the flood engine counts as HAZARD. A PARALLEL SIGNAL — never scored.
//
// Localhost first (same machine, no tunnel, no edge), the public hostname as
// a fallback so a dev checkout elsewhere still gets the join.
import { CONFIG } from '../config.js'
import { fetchJson } from '../util.js'

export const KV_KEY = 'twin_flood_v1'
const URLS = ['http://127.0.0.1:8340/api/twin', 'https://flood.nonarkara.org/api/twin']
const MAX_AGE_MS = 60 * 60 * 1000 // 1 h — FloodDash data is 10-minutely; older is silence, not calm water

const finite = (v) => (Number.isFinite(v) ? v : null)

/** Validate the wire shape — an upstream that changed under us must not
 *  become a poisoned kv row that every risk pass then trusts. */
export function parseTwin(body) {
  if (!body || body.system !== 'flooddash' || body.domain !== 'flood') throw new Error('not a flooddash twin payload')
  if (!Array.isArray(body.provinces) || body.provinces.length === 0) throw new Error('twin payload has no provinces')
  const provinces = body.provinces
    .filter((p) => p && typeof p.code === 'string' && p.code.length)
    .map((p) => ({
      code: p.code, th: p.th ?? null, en: p.en ?? null,
      score: finite(p.score) ?? 0,
      band: p.band ?? 'normal', level: p.level ?? 'safe',
      head_th: p.head_th ?? null, head_en: p.head_en ?? null,
      reason_th: p.reason_th ?? null, reason_en: p.reason_en ?? null,
      stations_l5: finite(p.stations_l5) ?? 0,
      stations_l4: finite(p.stations_l4) ?? 0,
      rain_24h_mm: finite(p.rain_24h_mm),
      wetness_band: p.wetness_band ?? null,
      eta_hours: finite(p.eta_hours),
    }))
  if (provinces.length === 0) throw new Error('twin payload has no usable provinces')
  return { version: body.version ?? null, updated: body.updated ?? null, provinces }
}

/** The last good relay, or null when there is none or it is too old to
 *  speak for the water now. `fetched_at` is when WE read it. */
export function readTwinFlood(db, now = Date.now()) {
  try {
    const raw = db.kvGet(KV_KEY)
    if (!raw) return null
    const rel = JSON.parse(raw)
    if (!rel?.fetched_at || now - Date.parse(rel.fetched_at) > MAX_AGE_MS) return null
    return rel
  } catch { return null }
}

/** Map<province_code, row> for the risk pass. */
export function floodByCode(relay) {
  return new Map((relay?.provinces ?? []).map((p) => [p.code, p]))
}

export default {
  name: 'twin_flood',
  label_th: 'FloodDash (ระบบแฝด — น้ำท่วม)',
  label_en: 'FloodDash twin (flood)',
  intervalMs: CONFIG.intervals.twin_flood,
  enabled: true,

  async run({ db }) {
    let lastErr = null
    for (const url of URLS) {
      try {
        const body = await fetchJson(url, { timeoutMs: 10_000 })
        const twin = parseTwin(body)
        db.kvSet(KV_KEY, JSON.stringify({ ...twin, source_url: url, fetched_at: new Date().toISOString() }))
        return { seen: twin.provinces.length, added: 0 }
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr ?? new Error('twin unreachable')
  },
}
