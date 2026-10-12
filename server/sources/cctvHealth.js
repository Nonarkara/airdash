// Is this camera actually showing anything? Measured, not assumed.
//
// On 2026-09-19 a sample of the live catalog showed only ~28 % of GISTDA and
// ~44 % of iTIC HLS streams serving a playlist (the rest 404 or hang) while
// every camera was flagged "online" — the map was full of pins that opened a
// black box. This source probes every HLS stream on a schedule and the
// registry (cctvRegistry.js) marks the dead ones offline, which the layer
// already hides. Cameras with no stream to probe (link-only BMA viewers, NST
// iframes) are labelled 'embed' and never judged — we cannot prove either way.
import { CONFIG } from '../config.js'
import { log } from '../util.js'
import { composeAll } from './cctvRegistry.js'
import { KV_KEY, setHealth, getHealth, hydrateOnce, applyHealth, summarize } from './cctvHealthStore.js'
export { applyHealth, summarize }

export const PROBE_TIMEOUT_MS = 5_000
const CONCURRENCY = 24   // in flight overall
const PER_HOST = 3       // in flight against any one server — these are municipal servers
const DEAD_AFTER_STRIKES = 2 // timeouts/5xx: two probes 30 min apart before a camera is hidden

// ── Why a pass used to take eight minutes ─────────────────────────────────
// CORRECTION to an earlier comment in this file, which claimed the probe
// "blocks the event loop". It never did: every fetch is awaited, so the loop
// stays free. The real cost was arithmetic. The 2026-10-12 health map held
// 561 cameras of which 456 (81 %) were dead, and the 30-minute schedule was
// re-probing all of them, every pass, forever — each dead camera holding a
// slot until PROBE_TIMEOUT_MS expired. A pass was measured at 410–497 s of
// near-pure waiting on sockets that were never going to answer.
//
// The wall-clock ceiling below bounds the damage. This ladder removes the
// waste it was bounding.
export const PROBE_BUDGET_MS = 25_000
let _rotation = 0

// A camera already known to be down is re-probed on a backoff ladder rather
// than every 30 minutes, indexed by how many strikes it has accumulated:
//   streak 2 -> 1 h, 3 -> 2 h, 4 -> 4 h, 5 -> 8 h, 6+ -> 12 h
// A camera that has been dead for days does not need re-proving 48 times a
// day, and each skip is a socket that never opens. A live probe resets the
// streak to 0, so a camera that recovers is back on the normal cadence at
// once — worst-case detection of a recovery is one backoff period, 12 h.
const DEAD_BACKOFF_MINUTES = [60, 120, 240, 480, 720]

/** Milliseconds until this camera is due for another probe. 0 = probe now. */
export function backoffMsFor(state, nowMs = Date.now()) {
  if (!state || state.status !== 'down') return 0   // live, flaky or unknown: normal cadence
  const streak = Math.max(DEAD_AFTER_STRIKES, state.fail_streak ?? DEAD_AFTER_STRIKES)
  const wait = DEAD_BACKOFF_MINUTES[Math.min(DEAD_BACKOFF_MINUTES.length - 1, streak - DEAD_AFTER_STRIKES)] * 60_000
  const last = Date.parse(state.checked_at ?? '')
  if (!Number.isFinite(last)) return 0              // never checked: probe it
  return Math.max(0, last + wait - nowMs)
}

import { keyOf } from './cctvHealthStore.js'

/** 'live' | 'dead' (the URL is gone) | 'slow' (could not tell — timeout, 5xx, network). */
export function classifyProbe({ status, body, error } = {}) {
  if (error) return 'slow'
  if (status === 404 || status === 410) return 'dead'
  if (status >= 200 && status < 300) return typeof body === 'string' && body.trimStart().startsWith('#EXTM3U') ? 'live' : 'dead'
  return 'slow'
}

/** Fold one probe result into a camera's running state. */
export function nextState(prev, result, nowMs = Date.now()) {
  const at = new Date(nowMs).toISOString()
  if (result === 'live') return { status: 'live', fail_streak: 0, last_ok_at: at, checked_at: at }
  // The streak is CAPPED. It used to count every failure since the camera was
  // last alive, and a camera dead for 11 days carried a streak of 555 — a
  // number that reads like a rate and means nothing, and that grows without
  // bound in a row that is written to the database every 30 minutes. Past the
  // point where a camera is already hidden and already on the longest backoff
  // rung, the exact count cannot change any decision. Anything above the last
  // rung is therefore the same number.
  const streak = Math.min((prev?.fail_streak ?? 0) + 1, DEAD_BACKOFF_MINUTES.length + DEAD_AFTER_STRIKES - 1)
  const down = result === 'dead' || streak >= DEAD_AFTER_STRIKES
  return { status: down ? 'down' : 'flaky', fail_streak: streak, last_ok_at: prev?.last_ok_at ?? null, checked_at: at }
}

async function defaultFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers: { 'user-agent': 'FloodDash-cctv-health/1.0' } })
  return { status: res.status, text: () => res.text() }
}

/** Probe every camera with an hls_url; returns the new health Map. */
export async function probeAll(cams, prevMap, { fetchImpl = defaultFetch, concurrency = CONCURRENCY, perHost = PER_HOST, now = Date.now(), budgetMs = PROBE_BUDGET_MS, realNow = Date.now } = {}) {
  // Everything with a stream to judge. Backed-off cameras are still in here:
  // they keep the verdict they already have, which is what stops a skipped
  // dead camera from vanishing from the map and being drawn as healthy again.
  const allJobs = cams.filter((c) => c.hls_url)
  const nowMs = typeof now === 'function' ? now() : now
  // Only those actually due for another look right now.
  const jobs = allJobs.filter((c) => backoffMsFor(prevMap.get(keyOf(c)), nowMs) <= 0)
  const out = new Map()
  const perHostBusy = new Map()
  // Rotate the starting point so a truncated pass does not re-probe the same
  // prefix forever and leave the tail permanently unexamined.
  const offset = jobs.length ? _rotation % jobs.length : 0
  _rotation = (offset + Math.max(1, Math.ceil(jobs.length / 4))) % Math.max(1, jobs.length)
  const queue = [...jobs.slice(offset), ...jobs.slice(0, offset)]
  const hostOf = (u) => { try { return new URL(u).host } catch { return 'invalid' } }
  // Carry the previous verdict for anything this pass does not reach, so the
  // budget can never silently un-hide a camera or drop its history.
  const carryForward = () => {
    for (const c of allJobs) {
      const k = keyOf(c)
      if (out.has(k)) continue
      const prev = prevMap.get(k)
      if (prev) out.set(k, prev)
    }
  }
  const probe = async (c) => {
    let result
    try {
      const res = await fetchImpl(c.hls_url)
      result = classifyProbe({ status: res.status, body: res.status < 300 ? await res.text() : '' })
    } catch (e) { result = classifyProbe({ error: String(e?.name ?? e) }) }
    out.set(keyOf(c), nextState(prevMap.get(keyOf(c)), result, now))
  }
  const startedAt = realNow()
  await new Promise((resolve) => {
    let active = 0
    const pump = () => {
      while (active < concurrency) {
        if (queue.length && realNow() - startedAt >= budgetMs) break
        const i = queue.findIndex((c) => (perHostBusy.get(hostOf(c.hls_url)) ?? 0) < perHost)
        if (i < 0) break
        const [c] = queue.splice(i, 1)
        const h = hostOf(c.hls_url)
        perHostBusy.set(h, (perHostBusy.get(h) ?? 0) + 1)
        active++
        probe(c).finally(() => { perHostBusy.set(h, perHostBusy.get(h) - 1); active--; pump() })
      }
      if (!active && !queue.length) resolve()
      else if (!active && queue.length) resolve() // budget exhausted: drain, carry the rest
    }
    pump()
  })
  carryForward()
  return out
}

export default {
  name: 'cctvHealth',
  label_th: 'ตรวจสอบกล้อง CCTV ว่าภาพสดจริงหรือไม่',
  label_en: 'CCTV stream health probe',
  intervalMs: CONFIG.intervals.cctv_health,
  enabled: true,
  // Added 2026-10-12 with the dead-camera backoff. This source had no version
  // field at all, so it never qualified for the boot-time "run immediately"
  // path — a change here would otherwise have waited its full 30-minute turn
  // before anyone could see it had any effect.
  version: 1, // bump when the fetch/parse logic changes → runs at next boot

  async run({ db }) {
    hydrateOnce(db)
    const cat = await composeAll({ useCache: false, skipHealth: true })
    const results = await probeAll(cat.cameras, getHealth())
    // Cameras that left the catalog drop out; everything probed replaces its old entry.
    setHealth(results)
    db.kvSet(KV_KEY, JSON.stringify({ checked_at: new Date().toISOString(), cameras: Object.fromEntries(results) }))
    const s = summarize(applyHealth(cat.cameras, results))
    log('info', 'cctv health probed', s)
    return { seen: results.size, added: 0 }
  },
}
