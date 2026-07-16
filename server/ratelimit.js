// Minimal in-memory fixed-window rate limiter — no dependency, good enough
// for a single-process Mac service sitting behind a Cloudflare Tunnel.
// Cloudflare's own edge absorbs the bulk of abusive traffic; this is a
// second, cheap backstop so one client can't pin the local Ollama chat call
// or hammer the DB-backed endpoints.
const buckets = new Map() // key -> { count, resetAt }

function clientIp(req) {
  // Traffic arrives via air.nonarkara.org (Pages) -> Pages Function proxy
  // -> api-air.nonarkara.org (tunnel) -> here. Cloudflare rewrites
  // cf-connecting-ip at EACH hop to the immediate peer, so by the time a
  // request reaches us that header is the Pages Function's own egress IP —
  // identical for every visitor — which would bucket all real users
  // together and rate-limit them as one "client". x-forwarded-for instead
  // accumulates one entry per hop with the original client first, so use
  // that when present.
  const xff = req.headers['x-forwarded-for']
  if (xff) return xff.split(',')[0].trim()
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
