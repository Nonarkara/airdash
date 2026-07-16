// Cloudflare Pages Function — proxies every /api/* request from the static
// dashboard (flood.nonarkara.org) to the live FloodDash backend running 24/7
// on the Mac, exposed via a named Cloudflare Tunnel at api-flood.nonarkara.org.
// (Deliberately one label, not api.flood.nonarkara.org — the zone's free
// Universal cert only covers *.nonarkara.org, one level deep; a two-level
// hostname needs its own paid Advanced Certificate, which this zone doesn't
// have provisioned.)
//
// Why a proxy: FloodDash is a stateful server (SQLite + 9 pipelines + local
// Ollama chat) that cannot run on Pages. Keeping it same-origin here means the
// frontend needs zero changes and there is no CORS to manage. Streaming
// responses (the SSE tap at /api/tap and chat at /api/chat) pass straight
// through — Workers stream a subrequest body without buffering.
const BACKEND = 'https://api-flood.nonarkara.org'

const JSON_TIMEOUT_MS = 30_000
const STREAM_TIMEOUT_MS = 300_000
const RETIRED_LINE_NOTIFY_PATHS = new Set([
  '/api/line/subscribe',
  '/api/line/unsubscribe',
  '/api/line/stats',
  '/api/line/tick',
  '/api/line/preview',
])

function isStreaming(pathname, method) {
  return pathname === '/api/tap' || (method === 'POST' && pathname === '/api/chat')
}

export async function onRequest({ request }) {
  const url = new URL(request.url)
  if (RETIRED_LINE_NOTIFY_PATHS.has(url.pathname)) {
    return new Response(JSON.stringify({
      error: 'LINE Notify integration retired',
      alternative: 'Follow the FloodDash LINE Official Account',
    }), {
      status: 410,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  const target = BACKEND + url.pathname + url.search
  const streaming = isStreaming(url.pathname, request.method)
  try {
    const upstream = await fetch(new Request(target, request), {
      signal: AbortSignal.timeout(streaming ? STREAM_TIMEOUT_MS : JSON_TIMEOUT_MS),
    })
    // Pass status + headers through; body streams for SSE/chat.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  } catch (err) {
    const offline = err?.name === 'TimeoutError'
    return new Response(
      JSON.stringify({
        error: offline ? 'backend timeout' : 'backend unreachable',
        hint: 'the FloodDash tunnel (api-flood.nonarkara.org) may be offline or slow',
      }),
      { status: offline ? 504 : 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
