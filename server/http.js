// Minimal HTTP layer: exact-match API routes + safe static file serving.
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createGzip, gzipSync } from 'node:zlib'
import { join, normalize, extname, sep } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'
import { allow } from './ratelimit.js'

// Text assets worth gzipping on the fly (the province-boundary GeoJSON especially).
const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.geojson', '.html', '.svg'])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
}

// ── CORS for the public open-data API ───────────────────────────────────
// Until 2026-09-16 this server sent NO CORS headers at all, so a browser on
// any other origin — the user's other dashboards included — could not read a
// single byte of /api/. Same policy as the FloodDash twin (server/http.js
// there, since 2026-09-08): read-only requests to /api/ answer `*` because
// publishing an API is the point; the operator surfaces (admin, LINE /
// Telegram webhooks + config, chat logs/FAQ moderation, export builds) never
// get CORS from any origin, so a stranger's page cannot even preflight them.
export const PRIVATE_API_PREFIXES = [
  '/api/admin/',
  '/api/telegram/',
  '/api/line/',
  '/api/chat/logs',
  '/api/chat/faqs',
  '/api/exports/build',
]
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isPublicApiRead(method, pathname) {
  if (!READ_METHODS.has(method)) return false
  if (!pathname.startsWith('/api/')) return false
  return !PRIVATE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export const PUBLIC_API_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Accept, Content-Type, If-None-Match',
  'access-control-expose-headers': 'x-airdash-stale-seconds, Retry-After',
  'access-control-max-age': '86400',
}

/** Set the public CORS headers on a read-only /api/ response. Returns true
 *  when they were applied. Uses setHeader so json()/sendPrebuilt()'s
 *  writeHead() merges them in instead of replacing them. */
export function applyPublicApiCors(req, res) {
  if (!isPublicApiRead(req.method, new URL(req.url, 'http://x').pathname)) return false
  for (const [k, v] of Object.entries(PUBLIC_API_CORS)) res.setHeader(k, v)
  return true
}

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  // The dashboard never needs any of these browser capabilities — deny them
  // outright rather than leaving the default (allowed for same-origin).
  // geolocation must stay allowed for same-origin: citizen mode's "near
  // me" feature calls getCurrentPosition (citizen.js) and the app is
  // served from this origin on LAN/tunnel use.
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
}

// Serialize + gzip an object ONCE into a reusable pair, for responses that
// are identical across many concurrent clients (e.g. the global snapshot).
// Caching the result of this lets bursts serve a pre-built buffer instead of
// re-stringifying and re-gzipping megabytes per request on the sync loop.
export function prebuild(obj) {
  const body = JSON.stringify(obj)
  return { body, gz: gzipSync(Buffer.from(body)) }
}

export function sendPrebuilt(res, code, built) {
  const acceptEncoding = res.req?.headers['accept-encoding'] ?? ''
  if (/\bgzip\b/.test(acceptEncoding)) {
    res.writeHead(code, {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-encoding': 'gzip',
      vary: 'Accept-Encoding',
    })
    res.end(built.gz)
  } else {
    res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(built.body)
  }
}

export function json(res, code, obj) {
  const body = JSON.stringify(obj)
  const bodyLength = Buffer.byteLength(body)
  const acceptEncoding = res.req?.headers['accept-encoding'] ?? ''
  const wantsGzip = /\bgzip\b/.test(acceptEncoding) && bodyLength > 1400

  if (wantsGzip) {
    const gz = gzipSync(Buffer.from(body))
    res.writeHead(code, {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-encoding': 'gzip',
      'vary': 'Accept-Encoding',
    })
    res.end(gz)
  } else {
    res.writeHead(code, {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(body)
  }
}

/** Stream a file from disk to the response with the right headers.
 *  Used for the weekly data export — the .tar.gz can be hundreds of MB,
 *  so we never buffer it in memory. Range requests are honored so a
 *  download manager can resume. */
import { statSync } from 'node:fs'
export function sendFile(res, filePath, { contentType = 'application/octet-stream', filename = null, cacheControl = 'no-store' } = {}) {
  let stat
  try { stat = statSync(filePath) } catch { return false }
  const headers = { ...SECURITY_HEADERS, 'content-type': contentType, 'cache-control': cacheControl, 'accept-ranges': 'bytes' }
  if (filename) headers['content-disposition'] = `attachment; filename="${filename}"`
  headers['content-length'] = String(stat.size)
  // Honor range request if present (the browser sends one on resume).
  const range = res.req?.headers['range']
  if (range && /^bytes=(\d+)-(\d*)$/.test(range)) {
    const m = range.match(/^bytes=(\d+)-(\d*)$/)
    const start = Number(m[1])
    const end = m[2] ? Number(m[2]) : stat.size - 1
    if (start <= end && end < stat.size) {
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': String(end - start + 1) })
      createReadStream(filePath, { start, end }).pipe(res)
      return true
    }
  }
  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
  return true
}

export async function readBody(req, limit = 64 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function serveStatic(req, res, pathname) {
  // Decode percent-encoding so filenames with spaces (e.g. the personal
  // photo library) resolve to disk. Without this, "Dad%20and%20me%201981.JPG"
  // gets joined as a literal path with %20 in it, missing the actual file.
  const decoded = (() => { try { return decodeURIComponent(pathname) } catch { return pathname } })()
  const rel = decoded === '/' ? '/index.html' : decoded
  const filePath = normalize(join(CONFIG.publicDir, rel))
  // A bare startsWith(publicDir) would also match a sibling directory that
  // happens to share the prefix (e.g. "public-evil"); require a path
  // separator (or exact match) at the boundary.
  if (filePath !== CONFIG.publicDir && !filePath.startsWith(CONFIG.publicDir + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not a file')
    const ext = extname(filePath)
    const longLived = rel.startsWith('/vendor/') || rel.startsWith('/fonts/') || rel.startsWith('/geo/') || rel.startsWith('/photos/')
    const headers = {
      ...SECURITY_HEADERS,
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': longLived ? 'public, max-age=2592000, immutable' : 'no-cache',
    }
    const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && info.size > 1400
    if (wantsGzip) {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding' })
      createReadStream(filePath).pipe(createGzip()).pipe(res)
    } else {
      res.writeHead(200, { ...headers, 'content-length': info.size })
      createReadStream(filePath).pipe(res)
    }
  } catch {
    res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('not found')
  }
}

export function startHttp(routes) {
  // Pre-compile a list of routes with `:param` placeholders, so we can match
  // /api/chat/faqs/123/approve against the registered
  // `POST /api/chat/faqs/:id/approve` template.
  const templated = []
  for (const [key, handler] of Object.entries(routes)) {
    const m = key.match(/^([A-Z]+)\s+(.+)$/)
    if (!m) continue
    const method = m[1]
    // Escape regex metacharacters in the static segments first (only the
    // ":param" placeholders should become capture groups) — a future route
    // with a literal "." or "+" would otherwise silently mismatch.
    const escaped = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pathRe = new RegExp('^' + escaped.replace(/:([A-Za-z_]+)/g, '([^/]+)') + '$')
    const paramNames = [...m[2].matchAll(/:([A-Za-z_]+)/g)].map((x) => x[1])
    templated.push({ method, pathRe, paramNames, handler })
  }

  const server = http.createServer(async (req, res) => {
    // Service identity on EVERY response, set before any handler runs. It lets
    // the edge proxy and the watchdog tell "AirDash answered" from "SOMETHING
    // answered on this port". On 2026-09-19 another launchd service bound
    // 127.0.0.1:8341 and answered every tunnel request with a plain-text 404
    // for ~20 hours; nothing could tell that apart from an AirDash 404, so the
    // proxy passed it through and the watchdog spent the night killing a
    // perfectly healthy server. Any response without this header did not come
    // from us.
    //
    // Deliberately here and NOT in SECURITY_HEADERS: plenty of responses (the
    // SSE tap, chat streaming, exports, 403/204/405) call writeHead() without
    // spreading SECURITY_HEADERS, and Node merges setHeader() values into
    // writeHead() — so this is the only spot that covers all of them.
    res.setHeader('x-service', 'airdash')
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const key = `${req.method} ${url.pathname}`
    let handler = routes[key]
    let params = {}
    if (!handler) {
      for (const t of templated) {
        if (t.method !== req.method) continue
        const m = url.pathname.match(t.pathRe)
        if (m) {
          handler = t.handler
          for (let i = 0; i < t.paramNames.length; i++) params[t.paramNames[i]] = m[i + 1]
          break
        }
      }
    }
    // Expose params on the URL so route handlers can read them via
    // url.searchParams.get(':id') or via the convenience below.
    if (handler && Object.keys(params).length) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(':' + k, v)
      }
    }
    if (url.pathname.startsWith('/api/')) {
      const isCors = applyPublicApiCors(req, res)
      // Preflight for a public read: answer here, before the rate limiter
      // and the route table — OPTIONS has no handler and would otherwise 405.
      if (isCors && req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    }
    if (!allow(req, { key: 'general', limit: 300, windowMs: 60_000 })) {
      res.writeHead(429, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'retry-after': '30' })
        .end(JSON.stringify({ error: 'rate limit exceeded' }))
      return
    }
    try {
      if (handler) await handler(req, res, url)
      else if (req.method === 'GET') await serveStatic(req, res, url.pathname)
      else res.writeHead(405).end()
    } catch (err) {
      log('error', 'request failed', { path: url.pathname, error: String(err?.message ?? err) })
      if (!res.headersSent) json(res, 500, { error: 'internal error' })
      else res.end()
    }
  })
  server.keepAliveTimeout = 65_000
  server.listen(CONFIG.port, CONFIG.host, () => {
    log('info', 'http listening', { host: CONFIG.host, port: CONFIG.port })
    watchForPortHijack()
  })
  return server
}

// Port-hijack sentinel. Binding successfully does NOT mean we receive the
// traffic: on macOS a listener bound to a SPECIFIC address (127.0.0.1) beats
// one bound to the wildcard (0.0.0.0) for connections to that address, and
// both binds succeed. That is exactly how a second service silently took over
// this port on 2026-09-19. So after listening — and every few minutes after —
// connect to ourselves the way the tunnel does (loopback) and check the
// answer carries OUR identity header. If it doesn't, someone else is
// answering; say so loudly in the error log with what we saw.
//
// Log-only by design: killing or restarting cannot fix a port we don't own,
// and the last time automated recovery was aimed at this problem it made
// things worse. The watchdog turns this into an alert.
function watchForPortHijack() {
  let hijacked = false
  const probe = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${CONFIG.port}/api/ping`, {
        signal: AbortSignal.timeout(5000), cache: 'no-store',
      })
      const ours = r.headers.get('x-service') === 'airdash'
      if (!ours && !hijacked) {
        hijacked = true
        log('error', 'PORT HIJACK: loopback requests to our own port are answered by another process', {
          port: CONFIG.port, status: r.status,
          server: r.headers.get('server') ?? null,
          contentType: r.headers.get('content-type') ?? null,
          hint: `run: lsof -nP -iTCP:${CONFIG.port} -sTCP:LISTEN`,
        })
      } else if (ours && hijacked) {
        hijacked = false
        log('info', 'port hijack cleared — loopback traffic reaches us again', { port: CONFIG.port })
      }
    } catch (err) {
      // Not reaching ourselves at all is also worth knowing about, but is
      // more often boot timing; only the identity mismatch is actionable.
      log('warn', 'port self-check could not connect', { error: String(err?.message ?? err) })
    }
  }
  setTimeout(probe, 3000).unref()
  setInterval(probe, 5 * 60_000).unref()
}
