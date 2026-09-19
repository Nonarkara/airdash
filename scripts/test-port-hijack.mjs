// Regression tests for the 2026-09-19 port hijack.
//
// WHAT HAPPENED — read before "simplifying" any of this.
// A second launchd service (the Sikhio CCTV relay) defaulted to 8341, AirDash's
// port, and bound 127.0.0.1:8341. On macOS a specific-address bind beats a
// wildcard (0.0.0.0) bind for loopback traffic, and BOTH binds succeed — so
// the Cloudflare tunnel's `localhost:8341` silently landed on the wrong
// process, which answered every request with a plain-text 404. For ~20 hours:
//   * the edge proxy treated `404` as a healthy backend (it only looked at
//     status >= 500) and handed the dashboard a stranger's 404 for
//     /api/snapshot instead of serving the stale edge mirror;
//   * the watchdog read "unreachable", blamed our own healthy server, and
//     killed + restarted it every hour, 22 times.
//
// The contract pinned here: every AirDash response carries `x-service:
// airdash`, and the edge treats any response WITHOUT it as "backend down".
//
// PROXY_PATH lets a test run point at an older copy of the proxy to prove
// these cases actually fail against the pre-fix code (they must).
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

// ── Part 1: the real HTTP layer tags EVERY response ───────────────────────
{
  process.env.PORT = String(39100 + Math.floor(Math.random() * 800))
  const { startHttp } = await import('../server/http.js')
  const routes = {
    'GET /api/ping': (req, res) => { res.statusCode = 200; res.end('pong') },
    // Deliberately a RAW writeHead with no SECURITY_HEADERS — the SSE tap,
    // chat streaming and exports all do this. Identity must survive it.
    'GET /api/raw': (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('raw') },
  }
  const server = startHttp(routes)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${process.env.PORT}`
  const idOf = async (path) => (await fetch(base + path)).headers.get('x-service')
  check('ping carries the identity header', (await idOf('/api/ping')) === 'airdash')
  check('a raw writeHead() response (SSE/chat/exports shape) still carries it', (await idOf('/api/raw')) === 'airdash')
  check("AirDash's own 404 carries it (a legit 404 is distinguishable from a stranger's)", (await idOf('/api/does-not-exist')) === 'airdash')
  await new Promise((r) => server.close(r))
}

// ── Part 2: the edge proxy ────────────────────────────────────────────────
const proxyPath = process.env.PROXY_PATH ?? resolve('functions/api/[[path]].js')
const { onRequest } = await import(pathToFileURL(proxyPath).href)
const realFetch = globalThis.fetch

class MemCache {
  store = new Map()
  async match(req) { const r = this.store.get(req.url); return r ? r.clone() : undefined }
  async put(req, res) { this.store.set(req.url, res) }
}
const ORIGIN = 'https://air.nonarkara.org'
const MIRROR_URL = (p) => `${ORIGIN}/__mirror__${p}`
const seedMirror = (cache, path, body) => cache.store.set(MIRROR_URL(path), new Response(body, {
  status: 200,
  headers: { 'content-type': 'application/json', 'x-airdash-mirror-at': String(Date.now() - 120_000) },
}))
const call = (path, cache, upstream) => {
  globalThis.fetch = async () => upstream()
  return onRequest({ request: new Request(ORIGIN + path), env: {}, cache })
}
const stranger404 = () => new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
const stranger200 = () => new Response('<html>some other service</html>', { status: 200, headers: { 'content-type': 'text/html' } })
const airdash = (body, status = 200) => () =>
  new Response(body, { status, headers: { 'content-type': 'application/json', 'x-service': 'airdash' } })

// 1. THE INCIDENT: stranger answers 404 for a mirrored endpoint → serve stale.
{
  const cache = new MemCache(); seedMirror(cache, '/api/snapshot', '{"last":"known good"}')
  const res = await call('/api/snapshot', cache, stranger404)
  check("stranger's 404 on /api/snapshot serves the stale mirror, not the 404", res.status === 200 && (await res.text()) === '{"last":"known good"}')
  check('  ...and says so honestly (mirror + stale-seconds + upstream status headers)',
    res.headers.get('x-airdash-mirror') === '1' &&
    Number(res.headers.get('x-airdash-stale-seconds')) >= 100 &&
    res.headers.get('x-airdash-upstream-status') === '404')
}

// 2. Stranger answers 200 (a catch-all service) — must not be served as our API
//    and must NOT be stored as the "last known good" mirror.
{
  const cache = new MemCache(); seedMirror(cache, '/api/snapshot', '{"last":"known good"}')
  const res = await call('/api/snapshot', cache, stranger200)
  const body = await res.text()
  check("stranger's 200 is never served to the dashboard as our API", !body.includes('some other service'))
  check("stranger's 200 does not overwrite the mirror", (await cache.match(new Request(MIRROR_URL('/api/snapshot')))) !== undefined &&
    (await (await cache.match(new Request(MIRROR_URL('/api/snapshot')))).text()) === '{"last":"known good"}')
}

// 3. Stranger + no mirror + mirrorable path → an honest 502, not a passed-through 404.
{
  const res = await call('/api/snapshot', new MemCache(), stranger404)
  check("no mirror available: 502 'wrong service answering', not the stranger's 404", res.status === 502 && (await res.json()).error === 'wrong service answering')
}

// 4. Stranger on a NON-mirrorable path (chat status) → 502, never the stranger's body.
{
  const res = await call('/api/chat/status', new MemCache(), stranger404)
  check("stranger's 404 on a non-mirrored endpoint becomes a 502", res.status === 502)
}

// 5. The happy path is unchanged: real AirDash 200 passes through and is mirrored.
{
  const cache = new MemCache()
  const res = await call('/api/snapshot', cache, airdash('{"live":true}'))
  check('genuine AirDash 200 passes straight through', res.status === 200 && (await res.text()) === '{"live":true}')
  check('  ...and is stored as the new last-known-good mirror', (await cache.match(new Request(MIRROR_URL('/api/snapshot')))) !== undefined)
}

// 6. A LEGITIMATE AirDash 404 (unknown route) must NOT be mistaken for an outage.
{
  const res = await call('/api/nope', new MemCache(), airdash('{"error":"not found"}', 404))
  check("AirDash's own 404 (with identity) passes through as a 404", res.status === 404)
}

// 7. A genuine AirDash 5xx still falls back to the mirror (pre-existing behaviour kept).
{
  const cache = new MemCache(); seedMirror(cache, '/api/snapshot', '{"last":"known good"}')
  const res = await call('/api/snapshot', cache, airdash('{"error":"boom"}', 500))
  check('genuine AirDash 500 still serves the stale mirror', res.status === 200 && res.headers.get('x-airdash-mirror') === '1')
}

globalThis.fetch = realFetch
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
