// Current 10 m wind on one Southeast Asia grid, from the keyless Open-Meteo
// forecast API. The browser never calls Open-Meteo itself.
//
// Cloudflare has no spend cap, and neither does a tunnel that proxies every
// visitor. This module therefore:
//   • asks upstream at most once per refresh, and that refresh is one HTTP
//     call (the grid is capped at 100 points, Open-Meteo's multi-point size);
//   • waits out a 30 minute TTL and a 20 minute minimum gap;
//   • stops at 36 upstream attempts per UTC day, then keeps serving the last
//     grid with stale:true rather than fetching again;
//   • persists that record in kv so a restart does not spend the day's cap
//     in the first minute.
import { fetchJson } from './util.js'
import {
  AIR_COPY, WIND_GRID, decodeCurrents, openMeteoUrl, pointsForGrid,
} from '../public/js/layers/wind-math.js'

const KEY = 'wind_field_v1'
const TTL_MS = 30 * 60 * 1000
const MIN_GAP_MS = 20 * 60 * 1000
const MAX_PER_DAY = 36

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)

function unavailable(reason, attempts) {
  return {
    available: false,
    stale: false,
    capped: reason === 'cap',
    reason,
    source: 'Open-Meteo',
    license: 'CC BY 4.0',
    url: 'https://open-meteo.com/',
    upstream_today: attempts,
    note_en: AIR_COPY.wind_en,
    note_th: AIR_COPY.wind_th,
    note_zh: AIR_COPY.wind_zh,
  }
}

function firstTime(json) {
  const list = Array.isArray(json) ? json : [json]
  for (const row of list) if (row?.current?.time) return row.current.time
  return null
}

export function createWindReader({ fetchImpl = fetchJson, now = () => Date.now() } = {}) {
  let memory = null
  let inflight = null

  function persist(db) {
    try { db?.kvSet?.(KEY, JSON.stringify(memory)) } catch { /* best effort */ }
  }

  function load(db) {
    if (memory || !db?.kvGet) return
    try { memory = JSON.parse(db.kvGet(KEY) || 'null') } catch { memory = null }
  }

  async function run(db) {
    const t = now()
    load(db)
    if (memory?.payload?.available && t - memory.fetchedAt < TTL_MS) {
      return { ...memory.payload, stale: false, capped: false, upstream_today: memory.attempts ?? 0 }
    }
    const day = dayKey(t)
    if (!memory || memory.day !== day) {
      memory = { ...(memory ?? {}), day, attempts: 0, lastAttemptAt: memory?.day === day ? memory.lastAttemptAt : 0 }
    }
    const capped = (memory.attempts ?? 0) >= MAX_PER_DAY
    const cooling = memory.lastAttemptAt && t - memory.lastAttemptAt < MIN_GAP_MS
    if (capped || cooling) {
      if (memory.payload?.available) {
        return { ...memory.payload, stale: true, capped, upstream_today: memory.attempts ?? 0 }
      }
      return unavailable(capped ? 'cap' : 'cooldown', memory.attempts ?? 0)
    }
    memory.lastAttemptAt = t
    memory.attempts = (memory.attempts ?? 0) + 1
    try {
      const points = pointsForGrid()
      const json = await fetchImpl(openMeteoUrl(points))
      if (!json || json.error) throw new Error(json?.reason || 'open-meteo error')
      const decoded = decodeCurrents(points, json)
      const cells = decoded.speed.filter((v) => v != null).length
      if (cells < 8) throw new Error('wind grid too sparse')
      const payload = {
        available: true,
        source: 'Open-Meteo',
        license: 'CC BY 4.0',
        url: 'https://open-meteo.com/',
        height_m: 10,
        fetched_at: new Date(t).toISOString(),
        valid_time: firstTime(json),
        ...WIND_GRID,
        speed_kmh: decoded.speed,
        from_deg: decoded.from_deg,
        cells,
        note_en: AIR_COPY.wind_en,
        note_th: AIR_COPY.wind_th,
        note_zh: AIR_COPY.wind_zh,
      }
      memory.fetchedAt = t
      memory.payload = payload
      persist(db)
      return { ...payload, stale: false, capped: false, upstream_today: memory.attempts }
    } catch {
      persist(db)
      if (memory.payload?.available) {
        return { ...memory.payload, stale: true, capped: false, upstream_today: memory.attempts }
      }
      return unavailable('upstream', memory.attempts)
    }
  }

  return function read(db) {
    if (!inflight) inflight = run(db).finally(() => { inflight = null })
    return inflight
  }
}

export const readWindField = createWindReader()
