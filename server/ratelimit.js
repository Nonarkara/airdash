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
  // accumulates one entry per hop.
  //
  // IMPORTANT: the FIRST entry is client-controlled — a client that sends
  // its own X-Forwarded-For header gets it *prepended* by every proxy, so
  // keying on hops[0] lets an attacker pick a fresh bucket per request and
  // bypass the limiter entirely. Key on the last UNTRUSTED hop instead:
  // the rightmost entry was appended by our own trusted edge, so the entry
  // just before it is the peer that edge actually saw — the closest thing
  // to a real client identity we can trust.
  const xff = req.headers['x-forwarded-for']
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (hops.length >= 2) return hops[hops.length - 2]
    if (hops.length === 1) return hops[0]
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
