import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { readFileSync } from 'node:fs'

// Per-machine key survives launchd reinstalls. Rotate it together with the
// Pages AIRDASH_PROXY_SECRET binding, then restart the backend.
let proxySecret = ''
try { proxySecret = readFileSync(new URL('../data/.proxy-secret', import.meta.url), 'utf8').trim() } catch {}

// Minimal in-memory fixed-window rate limiter — no dependency, good enough
// for a single-process Mac service sitting behind a Cloudflare Tunnel.
// Cloudflare's own edge absorbs the bulk of abusive traffic; this is a
// second, cheap backstop so one client can't pin the local Ollama chat call
// or hammer the DB-backed endpoints.
const buckets = new Map() // key -> { count, resetAt }

export function clientIp(req) {
  // Trust the visitor IP only when the Pages proxy signs it. A direct
  // tunnel client can forge X-Forwarded-For and every custom header.
  const ip = req.headers['x-airdash-client-ip']
  const signature = req.headers['x-airdash-client-signature']
  const secret = process.env.AIRDASH_PROXY_SECRET || proxySecret
  if (secret && typeof ip === 'string' && isIP(ip) && typeof signature === 'string' && /^[a-f0-9]{64}$/.test(signature)) {
    const expected = createHmac('sha256', secret).update(ip).digest()
    if (timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return ip
  }
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown'
}

/** Returns true if the request is allowed, false if it should be rejected. */
export function allow(req, { key = 'default', limit, windowMs }) {
  const bucketKey = `${key}:${clientIp(req)}`
  const now = Date.now()
  let b = buckets.get(bucketKey)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(bucketKey, b)
  }
  b.count += 1
  return b.count <= limit
}

// Sweep stale buckets periodically so the Map doesn't grow unbounded under
// distributed low-rate scanning traffic.
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
}, 5 * 60_000).unref()
