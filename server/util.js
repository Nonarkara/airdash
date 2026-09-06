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

// ── Daily-quota circuit breaker (ported from FloodDash, 2026-09-06) ─────
// A per-DAY quota is not a rate limit: no back-off brings it back before
// midnight, so retrying is pure harm. FloodDash learned this the hard way
// on 2026-09-01 — an exhausted Open-Meteo allowance plus retries turned into
// a socket storm that killed the process, and the in-memory state reset on
// restart so it re-stormed in a crash loop. AirDash calls the same host from
// THREE sources (openmeteo, openmeteo-aq, aq-history); the scheduler parks a
// source on a 429, but (a) that is per-source, so the other two keep burning
// the same spent allowance, and (b) Open-Meteo actually reports a spent day
// as HTTP 200 + {"error":true,"reason":"Daily API request limit exceeded"},
// which a plain res.json() hands to callers as data. This blocks the HOST,
// catches the 200 shape, and survives restarts via an injected kv store.
const quotaBlocked = new Map() // host → epoch ms when it may be tried again
let quotaStore = null
export function setQuotaStore(store) {
  quotaStore = store
  try {
    const saved = store?.load?.()
    if (saved && typeof saved === 'object') {
      for (const [host, until] of Object.entries(saved)) {
        if (Number.isFinite(until) && until > Date.now()) quotaBlocked.set(host, until)
      }
    }
  } catch { /* a bad cache must never block boot */ }
}
function persistQuota() {
  try { quotaStore?.save?.(Object.fromEntries(quotaBlocked)) } catch { /* best effort */ }
}
function nextUtcMidnight() {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 30)
}
function hostOf(url) { try { return new URL(url).host } catch { return null } }

/** True when `body` is a provider saying the daily allowance is spent. */
export function isDailyQuotaExhausted(body) {
  const reason = typeof body === 'string' ? body : (body?.reason ?? '')
  return /daily .*(request )?limit exceeded|quota exceeded for the day|try again tomorrow/i.test(String(reason))
}
/** Marks a host as spent for the rest of the UTC day. */
export function markQuotaExhausted(url) {
  const host = hostOf(url)
  if (!host) return
  const until = nextUtcMidnight()
  quotaBlocked.set(host, until)
  persistQuota()
  log('error', 'daily API quota exhausted — pausing this host until UTC midnight', {
    host, resumes_at: new Date(until).toISOString(),
  })
}
/** ms remaining on a host's quota block, or 0 when it may be called. */
export function quotaBlockMsRemaining(url) {
  const host = hostOf(url)
  if (!host) return 0
  const until = quotaBlocked.get(host)
  if (!until) return 0
  if (Date.now() >= until) { quotaBlocked.delete(host); persistQuota(); return 0 }
  return until - Date.now()
}
function assertQuotaOpen(url) {
  const ms = quotaBlockMsRemaining(url)
  if (ms > 0) {
    // "quota" is in the message on purpose: scheduler.isRateLimit() parks
    // the source on it, so a blocked host also stops the per-source timer.
    throw new Error(`daily quota exhausted for ${hostOf(url)}; not retrying for ${Math.round(ms / 60000)} min`)
  }
}
async function bodyTextSafe(res) {
  try {
    if (typeof res.clone === 'function') return await res.clone().text()
    if (typeof res.text === 'function') return await res.text()
  } catch { /* unreadable body → not a quota message */ }
  return ''
}

// Both fetchers used to be bare single-shot calls — no retry, no back-off.
// FloodDash's 2026-08-31 audit found exactly that asymmetry silently killing
// two pipelines for days ("aborted due to timeout", every attempt) while
// /api/health read green. Same policy now for both: retry the transient
// class with back-off; treat a spent daily quota as terminal.
const MAX_RETRIES = 3
const isTransient = (msg) => /aborted|timeout|fetch failed/i.test(msg)

async function fetchWithPolicy(url, { timeoutMs, headers, accept, parse }) {
  assertQuotaOpen(url)
  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, ...(accept ? { accept } : {}), ...headers },
      })
      if (res.status === 429) {
        const body = await bodyTextSafe(res)
        if (isDailyQuotaExhausted(body)) {
          markQuotaExhausted(url)
          throw new Error(`daily quota exhausted for ${hostOf(url)}`)
        }
        if (attempt < MAX_RETRIES) {
          const retryAfter = parseInt(res.headers?.get?.('retry-after') ?? '', 10)
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 60_000) : 2000 * Math.pow(2, attempt)
          log('warn', 'fetch 429 rate-limited, retrying', { url: url.slice(0, 120), attempt, waitMs })
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const out = await parse(res)
      if (isDailyQuotaExhausted(out)) {
        markQuotaExhausted(url)
        throw new Error(`daily quota exhausted for ${hostOf(url)}: ${out?.reason ?? ''}`.trim())
      }
      return out
    } catch (err) {
      lastError = err
      const msg = String(err?.message ?? err)
      if (/daily quota exhausted/i.test(msg)) throw err   // terminal — never retry
      if (attempt < MAX_RETRIES && isTransient(msg)) {
        const waitMs = 2000 * Math.pow(2, attempt)
        log('warn', 'fetch transient error, retrying', { url: url.slice(0, 120), attempt, waitMs })
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw lastError
}

export function fetchJson(url, { timeoutMs = CONFIG.fetchTimeoutMs, headers = {} } = {}) {
  return fetchWithPolicy(url, { timeoutMs, headers, accept: 'application/json', parse: (r) => r.json() })
}

export function fetchText(url, { timeoutMs = CONFIG.fetchTimeoutMs, headers = {} } = {}) {
  return fetchWithPolicy(url, { timeoutMs, headers, accept: null, parse: (r) => r.text() })
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
