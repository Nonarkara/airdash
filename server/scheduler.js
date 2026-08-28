// Polling scheduler: one self-rescheduling timer per source (no overlap),
// jittered intervals, exponential backoff on failure, full run history.
//
// 429-aware: when a source returns 429 (rate limited — usually "daily
// quota exhausted" on free APIs like Open-Meteo), normal exponential
// backoff (max 6× = 18h) is INSUFFICIENT — the quota won't reset
// until the API's daily window rolls. The scheduler now detects the
// pattern and parks the source for 24h on the first 429, regardless
// of the base interval, so we don't keep burning the same day's
// quota on retries that will only fail. The 24h is a deliberate
// overshoot — the next attempt will land on the next day's window,
// which is also when the real failure mode (if any) will surface.
import { log, jitter } from './util.js'

const MAX_BACKOFF_MULTIPLIER = 6
const MAX_RUN_MS = 10 * 60_000 // 10 min hard ceiling; a hung source must not block forever
// How long to park a 429 source. 24h covers any sensible "daily"
// reset window (UTC midnight, US-midnight, etc) with margin. The
// scheduler's `nextDelay()` overrides its own exponential backoff
// when this is set.
const RATE_LIMIT_PARK_MS = 24 * 60 * 60_000

function isRateLimit(err) {
  if (!err) return false
  const s = String(err?.message ?? err)
  // 429 from any upstream. The body text varies ("Daily API request
  // limit exceeded", "Too Many Requests", "rate limit", etc); the
  // status code 429 is the one true signal. The fetchJson helper
  // throws an Error whose message contains the URL; we look for
  // "429" anywhere in that string, plus the standard "Too Many
  // Requests" body phrase.
  return /\b429\b/.test(s) || /Too Many Requests/i.test(s) || /rate.?limit/i.test(s)
}

export function createScheduler({ db, bus, alerts, sources }) {
  const state = new Map() // name → { source, failures, lastRun, lastOk, lastError, running, timer, runTimer, parkedUntil }

  function register(source) {
    if (!source.enabled) {
      log('info', 'source disabled', { source: source.name })
      return
    }
    state.set(source.name, { source, failures: 0, lastRun: null, lastOk: null, lastError: null, running: false, timer: null, runTimer: null, parkedUntil: null })
  }

  async function runOnce(name) {
    const s = state.get(name)
    if (!s || s.running) return
    // If we're in a rate-limit park window, skip the run entirely and
    // reschedule to the end of the park. No upstream call, no quota
    // burn, no false failure increment.
    if (s.parkedUntil && Date.now() < s.parkedUntil) {
      schedule(name)
      return
    }
    s.running = true
    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    // Hard ceiling: if the source somehow hangs past all its own timeouts,
    // force-reset running state and reschedule so the pipeline keeps breathing.
    s.runTimer = setTimeout(() => {
      if (!s.running) return
      s.running = false
      s.lastError = `run exceeded ${MAX_RUN_MS}ms, forced reset`
      db.recordRun({ source: name, started_at: startedAt, dur_ms: MAX_RUN_MS, ok: false, error: s.lastError })
      log('error', 'ingest hung, forced reset', { source: name })
      bus.publish({
        kind: 'status', source: name, severity: 2,
        title_th: `แหล่งข้อมูล ${s.source.label_th} ค้างเกินเวลา กำลังรีเซ็ต`,
        title_en: `Source ${s.source.label_en} hung, resetting`,
        payload: { error: s.lastError },
      })
      schedule(name)
    }, MAX_RUN_MS)
    s.runTimer.unref()

    try {
      const result = await s.source.run({ db, bus, alerts })
      clearTimeout(s.runTimer)
      const durMs = Date.now() - t0
      s.failures = 0
      s.lastRun = startedAt
      s.lastOk = startedAt
      s.lastError = null
      s.parkedUntil = null  // any prior rate-limit park is lifted on a clean run
      db.recordRun({ source: name, started_at: startedAt, dur_ms: durMs, ok: true,
                     rows_seen: result?.seen ?? 0, rows_new: result?.added ?? 0 })
      log('info', 'ingest ok', { source: name, durMs, seen: result?.seen ?? 0, added: result?.added ?? 0 })
    } catch (err) {
      clearTimeout(s.runTimer)
      const durMs = Date.now() - t0
      s.lastRun = startedAt
      s.lastError = String(err?.message ?? err)
      // Rate-limit handling. Park the source for 24h so we don't
      // burn the daily quota on retries that will all fail with
      // the same error. We do NOT increment failures on a rate-limit
      // hit — the exponential-backoff track is for transient errors
      // (timeouts, network blips), and conflating them with a
      // day-locked quota would punish healthy sources later when the
      // quota resets.
      if (isRateLimit(err)) {
        s.parkedUntil = Date.now() + RATE_LIMIT_PARK_MS
        s.failures = 0
        log('warn', 'ingest rate-limited — parked for 24h', {
          source: name, error: s.lastError,
          retry_at: new Date(s.parkedUntil).toISOString(),
        })
        bus.publish({
          kind: 'status', source: name, severity: 1,
          title_th: `แหล่งข้อมูล ${s.source.label_th} ถูก rate-limit — จะลองอีกครั้งใน 24 ชม.`,
          title_en: `Source ${s.source.label_en} rate-limited — next attempt in 24h`,
          payload: { error: s.lastError, retry_at: new Date(s.parkedUntil).toISOString() },
        })
      } else {
        s.failures += 1
        log('error', 'ingest failed', { source: name, failures: s.failures, error: s.lastError })
        bus.publish({
          kind: 'status', source: name, severity: 2,
          title_th: `แหล่งข้อมูล ${s.source.label_th} ขัดข้อง (ครั้งที่ ${s.failures})`,
          title_en: `Source ${s.source.label_en} failed (attempt ${s.failures})`,
          payload: { error: s.lastError },
        })
      }
      db.recordRun({ source: name, started_at: startedAt, dur_ms: durMs, ok: false, error: s.lastError })
    } finally {
      s.running = false
      schedule(name)
    }
  }

  function nextDelay(s) {
    // Rate-limit park takes precedence — we just skip until the
    // parked window ends, regardless of exponential backoff.
    if (s.parkedUntil) {
      const ms = s.parkedUntil - Date.now()
      if (ms > 0) return ms
      // Park expired; clear it so we go back to normal scheduling.
      s.parkedUntil = null
    }
    const base = s.source.intervalMs
    const multiplier = Math.min(2 ** s.failures, MAX_BACKOFF_MULTIPLIER)
    return jitter(base * (s.failures > 0 ? multiplier : 1))
  }

  function schedule(name, delayMs) {
    const s = state.get(name)
    if (!s) return
    clearTimeout(s.timer)
    s.timer = setTimeout(() => runOnce(name), delayMs ?? nextDelay(s))
    s.timer.unref()
  }

  function start() {
    // Stagger boot so seven sources don't slam the network at once.
    let offset = 0
    for (const name of state.keys()) {
      schedule(name, offset)
      offset += 5_000
    }
    log('info', 'scheduler started', { sources: [...state.keys()] })
  }

  function health() {
    const out = {}
    for (const [name, s] of state) {
      out[name] = {
        label_th: s.source.label_th,
        label_en: s.source.label_en,
        intervalMs: s.source.intervalMs,
        failures: s.failures,
        lastRun: s.lastRun,
        lastOk: s.lastOk,
        lastError: s.lastError,
        running: s.running,
        parkedUntil: s.parkedUntil ? new Date(s.parkedUntil).toISOString() : null,
      }
    }
    return out
  }

  sources.forEach(register)
  return { start, runOnce, health }
}
