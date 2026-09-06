// Cloudflare Pages Function — proxies every /api/* request from the static
// dashboard (air.nonarkara.org) to the live AirDash backend running 24/7
// on the Mac, exposed via a named Cloudflare Tunnel at api-air.nonarkara.org.
//
// Why a proxy: AirDash is a stateful server (SQLite + 7 pipelines + cloud
// LLM chat) that cannot run on Pages. Keeping it same-origin here means the
// frontend needs zero changes and there is no CORS to manage. Streaming
// responses (the SSE tap at /api/tap and chat at /api/chat) pass straight
// through — Workers stream a subrequest body without buffering.
//
// FAILOVER + MIRROR (port from FloodDash v4.11.1/2): two machines can serve
// production and a single tunnel 530 must not take the country's air picture
// offline. Try primary (env AIRDASH_BACKEND) then the other; on 5xx / tunnel
// 52x/530 / timeout try the next; only then serve the stale edge mirror.
// The mirror keeps last-known-good for boot-critical reads (snapshot, risk,
// etc.) with x-airdash-stale-seconds so the frontend can show an honest
// banner instead of a dead 502. Per-colo best-effort, but Bangkok/Singapore
// stays warm for TH users.
const BACKEND = 'https://api-air.nonarkara.org'
const ALL_BACKENDS = ['https://api-air.nonarkara.org', 'https://api2-air.nonarkara.org']
function backendOrder(env) {
  const primary = env?.AIRDASH_BACKEND ?? BACKEND
  return [primary, ...ALL_BACKENDS.filter((b) => b !== primary)]
}
const isBackendDown = (res) => res.status >= 500

const JSON_TIMEOUT_MS = 30_000
const STREAM_TIMEOUT_MS = 300_000
const SNAPSHOT_TIMEOUT_MS = 8_000
const EDGE_CACHEABLE_PATHS = new Set(['/api/risk', '/api/snapshot'])
const MIRROR_PATHS = new Set([
  '/api/snapshot', '/api/risk', '/api/wetness', '/api/insights',
  '/api/series/daily', '/api/forecast', '/api/sources', '/api/washout',
  '/api/series', '/api/stations',
])
const MIRROR_TTL_S = 86_400

function isStreaming(pathname, method) {
  return pathname === '/api/tap' || (method === 'POST' && pathname === '/api/chat')
}

function mirrorKey(url) {
  return new Request(new URL('/__mirror__' + url.pathname + url.search, url.origin).toString())
}

async function storeMirror(cache, key, upstream) {
  const h = new Headers()
  for (const k of ['content-type', 'content-encoding', 'vary']) {
    const v = upstream.headers.get(k)
    if (v) h.set(k, v)
  }
  h.set('cache-control', `public, max-age=${MIRROR_TTL_S}`)
  h.set('x-airdash-mirror-at', String(Date.now()))
  const body = await upstream.arrayBuffer()
  await cache.put(key, new Response(body, { status: 200, headers: h }))
}

async function serveStale(cache, url, upstreamStatus) {
  const cached = await cache.match(mirrorKey(url))
  if (!cached) return null
  const mirrorAt = Number(cached.headers.get('x-airdash-mirror-at') ?? 0)
  const ageS = mirrorAt ? Math.round((Date.now() - mirrorAt) / 1000) : -1
  const h = new Headers(cached.headers)
  h.set('x-airdash-stale-seconds', String(ageS))
  h.set('x-airdash-mirror', '1')
  h.set('x-airdash-data-mode', 'edge-cache')
  if (upstreamStatus) h.set('x-airdash-upstream-status', String(upstreamStatus))
  h.set('warning', '110 - "Response is stale"')
  h.set('cache-control', 'no-store')
  return new Response(cached.body, { status: 200, headers: h })
}

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const streaming = isStreaming(url.pathname, request.method)
  const snapshot = request.method === 'GET' && url.pathname === '/api/snapshot'
  const cache = context.cache ?? globalThis.caches?.default ?? null
  const mirrorable = Boolean(cache && request.method === 'GET' && MIRROR_PATHS.has(url.pathname))
  const timeoutMs = streaming ? STREAM_TIMEOUT_MS : snapshot ? SNAPSHOT_TIMEOUT_MS : JSON_TIMEOUT_MS

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.delete('connection')
  headers.delete('cf-connecting-ip')
  headers.delete('cf-ray')
  headers.delete('cf-ipcountry')
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) headers.set('x-forwarded-for', clientIp)

  const MAX_PROXY_BODY = 256 * 1024
  let body = request.method === 'GET' || request.method === 'HEAD'
    ? null : await request.arrayBuffer()
  if (body && body.byteLength > MAX_PROXY_BODY) {
    return new Response(JSON.stringify({ error: 'payload too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  try {
    let upstream = null
    let lastErr = null
    for (const backend of backendOrder(context.env)) {
      const target = backend + url.pathname + url.search
      try {
        const res = await fetch(new Request(target, {
          method: request.method, headers, body, redirect: 'manual',
        }), { signal: AbortSignal.timeout(timeoutMs) })
        upstream = res
        if (!isBackendDown(res)) break
        lastErr = new Error(`HTTP ${res.status} from ${backend}`)
      } catch (err) {
        lastErr = err
      }
    }
    if (!upstream) throw lastErr ?? new Error('no backend answered')

    if (mirrorable && upstream.status >= 500) {
      const stale = await serveStale(cache, url, upstream.status)
      if (stale) return stale
    }

    if (mirrorable && upstream.ok) {
      const write = storeMirror(cache, mirrorKey(url), upstream.clone()).catch(() => {})
      if (context.waitUntil) context.waitUntil(write)
      else await write
    }

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
    if (!streaming && request.method === 'GET' && EDGE_CACHEABLE_PATHS.has(url.pathname)) {
      response.headers.set('cache-control', 'public, s-maxage=30, stale-while-revalidate=60')
    }
    if (snapshot && upstream.ok) response.headers.set('x-airdash-data-mode', 'live')
    return response
  } catch (err) {
    if (mirrorable) {
      const stale = await serveStale(cache, url, err?.name === 'TimeoutError' ? 504 : 502)
      if (stale) return stale
    }
    const offline = err?.name === 'TimeoutError'
    return new Response(
      JSON.stringify({
        error: offline ? 'backend timeout' : 'backend unreachable',
        hint: 'the AirDash tunnel (api-air.nonarkara.org) may be offline or slow',
      }),
      { status: offline ? 504 : 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
