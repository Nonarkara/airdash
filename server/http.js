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

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  // The dashboard never needs any of these browser capabilities — deny them
  // outright rather than leaving the default (allowed for same-origin).
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
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
  const rel = pathname === '/' ? '/index.html' : pathname
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
    const longLived = rel.startsWith('/vendor/') || rel.startsWith('/fonts/') || rel.startsWith('/geo/')
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
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
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
  })
  return server
}
