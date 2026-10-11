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

// Wall-clock ceiling for one whole probe pass.
//
// This source runs INSIDE the HTTP event loop. With 806 cameras, ~457 of them
// dead and each dead camera holding a slot for the full timeout, the pass was
// measured at 410–497 s on 2026-10-11 — nine minutes in which the single
// synchronous server could not answer /api/ping and the public site returned
// 504 for the whole stretch. The probe is I/O-bound and mostly waiting on
// sockets that will never answer, so the time was spent proving nothing.
//
// A pass that runs out of budget is NOT a failure for the cameras it never
// reached: they keep the state they already had, exactly as if they had passed
// an identical check. That makes the ceiling safe — it bounds the block without
// inventing a verdict, and a camera that recovers is judged on the next pass
// like any other.
//
// The ceiling is set BELOW Cloudflare's 30 s origin timeout on purpose. A
// 90 s budget would still hand every visitor a 504 for a minute and a half —
// merely shorter than the nine minutes we had, which is not the same as fixed.
// At 25 s the worst window fits inside the timeout.
//
// Because the queue is cut short, it starts at a rotating offset each pass.
// Without that, the same prefix of cameras would be probed every cycle and the
// tail would never be looked at — coverage would be fake.
export const PROBE_BUDGET_MS = 25_000
let _rotation = 0

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
  const streak = (prev?.fail_streak ?? 0) + 1
  const down = result === 'dead' || streak >= DEAD_AFTER_STRIKES
  return { status: down ? 'down' : 'flaky', fail_streak: streak, last_ok_at: prev?.last_ok_at ?? null, checked_at: at }
}

async function defaultFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers: { 'user-agent': 'FloodDash-cctv-health/1.0' } })
  return { status: res.status, text: () => res.text() }
}

/** Probe every camera with an hls_url; returns the new health Map. */
export async function probeAll(cams, prevMap, { fetchImpl = defaultFetch, concurrency = CONCURRENCY, perHost = PER_HOST, now = Date.now(), budgetMs = PROBE_BUDGET_MS, realNow = Date.now } = {}) {
  const jobs = cams.filter((c) => c.hls_url)
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
    for (const c of jobs) {
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
