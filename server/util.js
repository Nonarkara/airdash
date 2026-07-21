// Shared primitives: logging, guarded fetch, boundary validation.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CONFIG } from './config.js'

const execFileP = promisify(execFile)

export function log(level, msg, extra = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra })
  if (level === 'error') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

const UA = 'AirDash/1.0 (local air-quality monitoring; nonsmartcity@gmail.com)'

export async function fetchJson(url, { timeoutMs = CONFIG.fetchTimeoutMs, headers = {} } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA, accept: 'application/json', ...headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export async function fetchText(url, { timeoutMs = CONFIG.fetchTimeoutMs, headers = {} } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA, ...headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

// Air4Thai serves an incomplete TLS chain that Node's fetch rejects but the
// macOS system curl resolves. This is the one endpoint fetched via curl.
export async function curlJson(url, { timeoutMs = CONFIG.fetchTimeoutMs } = {}) {
  const { stdout } = await execFileP(
    'curl', ['-sf', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-A', UA, url],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  return JSON.parse(stdout)
}

/** Finite number or null — the boundary guard for every upstream value. */
export function num(x) {
  if (x === null || x === undefined || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

/**
 * Valid number with sanity bounds for the named metric. Returns the
 * numeric value when it's finite AND within [min, max] for the metric;
 * null otherwise. The bound check uses CONFIG.validityBounds, which
 * is set comfortably above the worst real-world observation we know
 * of — anything past the bound is a sensor reading NaN/garbage, not
 * a measurement. The dropped value is logged once per (source, metric)
 * per ingest so a curious operator can see the raw upstream value that
 * got rejected; the log is rate-limited so a single bad station
 * doesn't flood logs/err.log.
 */
const _logDropped = new Map() // key: source|metric, value: count in this process
function logDroppedOnce(source, metric, raw) {
  const key = `${source}|${metric}`
  const c = _logDropped.get(key) ?? 0
  if (c < 3) {  // first 3 per source/metric go to log; the rest are dropped silently
    log('warn', 'reading out of bounds — rejected', { source, metric, raw, bound: CONFIG.validityBounds[metric] })
  }
  _logDropped.set(key, c + 1)
}
export function validNum(x, metric, source = 'unknown') {
  const n = num(x)
  if (n === null) return null
  const b = CONFIG.validityBounds?.[metric]
  if (!b) return n
  if (n < b.min || n > b.max) {
    logDroppedOnce(source, metric, n)
    return null
  }
  return n
}

/** Non-empty trimmed string or null. */
export function str(x) {
  if (typeof x !== 'string') return null
  const s = x.trim()
  return s.length ? s : null
}

/** "2026-07-03 19:20" → "2026-07-03T19:20"; date-only strings pass through. */
export function normTime(x) {
  const s = str(x)
  return s ? s.replace(' ', 'T') : null
}

/** Now in Bangkok local time as "YYYY-MM-DDTHH:MM:SS" (upstreams report TH time). */
export function nowLocal() {
  const d = new Date(Date.now() + 7 * 3600_000)
  return d.toISOString().slice(0, 19)
}

export function jitter(ms, pct = 0.1) {
  return Math.round(ms * (1 - pct + Math.random() * 2 * pct))
}
