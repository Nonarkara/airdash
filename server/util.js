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

const UA = 'FloodDash/1.0 (local flood monitoring; nonsmartcity@gmail.com)'

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
