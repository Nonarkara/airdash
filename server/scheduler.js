// Polling scheduler: one self-rescheduling timer per source (no overlap),
// jittered intervals, exponential backoff on failure, full run history.
import { log, jitter } from './util.js'

const MAX_BACKOFF_MULTIPLIER = 6
const MAX_RUN_MS = 10 * 60_000 // 10 min hard ceiling; a hung source must not block forever

export function createScheduler({ db, bus, alerts, sources }) {
  const state = new Map() // name → { source, failures, lastRun, lastOk, lastError, running, timer, runTimer }

  function register(source) {
    if (!source.enabled) {
      log('info', 'source disabled', { source: source.name })
      return
    }
    state.set(source.name, { source, failures: 0, lastRun: null, lastOk: null, lastError: null, running: false, timer: null, runTimer: null })
  }

  async function runOnce(name) {
    const s = state.get(name)
    if (!s || s.running) return
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
      db.recordRun({ source: name, started_at: startedAt, dur_ms: durMs, ok: true,
                     rows_seen: result?.seen ?? 0, rows_new: result?.added ?? 0 })
      log('info', 'ingest ok', { source: name, durMs, seen: result?.seen ?? 0, added: result?.added ?? 0 })
    } catch (err) {
      clearTimeout(s.runTimer)
      const durMs = Date.now() - t0
      s.failures += 1
      s.lastRun = startedAt
      s.lastError = String(err?.message ?? err)
      db.recordRun({ source: name, started_at: startedAt, dur_ms: durMs, ok: false, error: s.lastError })
      log('error', 'ingest failed', { source: name, failures: s.failures, error: s.lastError })
      bus.publish({
        kind: 'status', source: name, severity: 2,
        title_th: `แหล่งข้อมูล ${s.source.label_th} ขัดข้อง (ครั้งที่ ${s.failures})`,
        title_en: `Source ${s.source.label_en} failed (attempt ${s.failures})`,
        payload: { error: s.lastError },
      })
    } finally {
      s.running = false
      schedule(name)
    }
  }

  function nextDelay(s) {
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
      }
    }
    return out
  }

  sources.forEach(register)
  return { start, runOnce, health }
}
