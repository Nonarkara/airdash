// Behavioral regressions found in the 2026-10-02 codebase audit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildRoutes } from '../server/api.js'
import { provinceVerdict, nationalVerdict } from '../server/verdict.js'
import { onRequest } from '../functions/api/[[path]].js'
import { clientIp } from '../server/ratelimit.js'
import { createHmac } from 'node:crypto'
import { openDb } from '../server/db.js'
import { notifySubscribersForAlert, tickTelegramPush } from '../server/telegramPush.js'
import { notifySubscribersForAlert as notifyLine, tickLinePush } from '../server/linePush.js'

let passed = 0
const test = async (name, fn) => { await fn(); passed++; console.log('PASS', name) }

await test('forged forwarding headers cannot choose rate-limit identity; a signed proxy visitor can', () => {
  const old = process.env.AIRDASH_PROXY_SECRET
  process.env.AIRDASH_PROXY_SECRET = 'test-only-proxy-secret'
  try {
    const req = { headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '198.51.100.9, 192.0.2.1',
      'x-airdash-client-ip': '198.51.100.9', 'x-airdash-client-signature': 'a'.repeat(64) }, socket: { remoteAddress: '127.0.0.1' } }
    assert.equal(clientIp(req), '192.0.2.1')
    req.headers['x-airdash-client-signature'] = createHmac('sha256', process.env.AIRDASH_PROXY_SECRET).update('198.51.100.9').digest('hex')
    assert.equal(clientIp(req), '198.51.100.9')
    req.headers['x-airdash-client-ip'] = '198.51.100.10'
    assert.equal(clientIp(req), '192.0.2.1')
  } finally { if (old === undefined) delete process.env.AIRDASH_PROXY_SECRET; else process.env.AIRDASH_PROXY_SECRET = old }
})

await test('all coordinate lookups reject absent, blank, nonnumeric, and out-of-coverage points before DB access', () => {
  const routes = buildRoutes({ db: { all() { throw Error('unexpected DB lookup') } } })
  for (const path of ['/api/place', '/api/stations/nearest', '/api/weather/at']) {
    for (const query of ['', '?lat=&lng=', '?lat=13&lng=', '?lat=foo&lng=100', '?lat=Infinity&lng=100', '?lat=0&lng=0', '?lat=13&lng=360']) {
      const res = { req: { headers: {} }, writeHead(status) { this.status = status }, end(body) { this.body = body } }
      routes['GET ' + path]({}, res, new URL('https://air.test' + path + query))
      assert.equal(res.status, 400, path + query)
    }
  }
})

await test('negative nearest-station limits cannot return almost the whole candidate set', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ station_key: String(i), lat: 13.75, lng: 100.5, pm25: 10 }))
  const routes = buildRoutes({ db: { all: () => rows } })
  const res = { req: { headers: {} }, writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
  routes['GET /api/stations/nearest']({}, res, new URL('https://air.test/api/stations/nearest?lat=13.75&lng=100.5&limit=-1'))
  assert.equal(res.status, 200)
  assert.equal(res.body.stations.length, 1)
})

await test('missing observed air is not a clean-air verdict locally or nationally', () => {
  for (const p of [null, {}, { pm25: null, band: 'normal' }]) {
    const v = provinceVerdict(p)
    assert.equal(v.level, 'watch')
    assert.equal(v.data_available, false)
    assert.match(v.head_en, /unavailable/i)
  }
  const v = nationalVerdict({ national: { band: 'normal' }, provinces: [] })
  assert.equal(v.level, 'watch')
  assert.equal(v.data_available, false)
  assert.equal(provinceVerdict({ pm25: 0, band: 'normal' }).level, 'safe')
  assert.equal(provinceVerdict({ pm25: null, band: 'high' }).level, 'danger')
})

function workerHarness() {
  const handlers = {}, entries = new Map(), names = new Set(['airdash-old', 'unrelated-cache'])
  const caches = {
    async open(name) {
      names.add(name)
      await new Promise((r) => setTimeout(r, 5))
      return { async put(req, res) { entries.set(typeof req === 'string' ? req : req.url, new Response(await res.arrayBuffer(), { status: res.status })) } }
    },
    async match(req) { return entries.get(typeof req === 'string' ? req : req.url)?.clone() },
    async keys() { return [...names] },
    async delete(name) { names.delete(name) },
  }
  const context = vm.createContext({ URL, Response, caches,
    self: { location: { origin: 'https://air.test' }, addEventListener: (name, fn) => { handlers[name] = fn }, clients: { claim: async () => {} } },
    fetch: async () => { throw Error('offline') },
  })
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), context)
  const call = (path, mode = 'cors', method = 'GET') => {
    const waits = []
    const event = { request: { url: 'https://air.test' + path, method, mode }, waitUntil: (p) => waits.push(p), respondWith: (p) => { event.response = p } }
    handlers.fetch(event)
    return { event, async settled() { await Promise.all(waits) } }
  }
  return { context, handlers, entries, names, call }
}

await test('dashboard registers its worker even when the dynamic import arrives after window load', () => {
  let registered = 0
  const main = readFileSync('public/js/main.js', 'utf8')
  const context = vm.createContext({
    window: { addEventListener() {} }, // load has already fired
    navigator: { serviceWorker: { register(path) { assert.equal(path, '/sw.js'); registered++; return Promise.resolve() } } },
  })
  vm.runInContext(main.slice(main.lastIndexOf("if ('serviceWorker' in navigator)")), context)
  assert.equal(registered, 1)
})

await test('module requests cache before body consumption and survive offline', async () => {
  const h = workerHarness()
  h.context.fetch = async () => { const r = new Response('export const ready = true'); Object.defineProperty(r, 'type', { value: 'basic' }); return r }
  const first = h.call('/js/example.js')
  assert.equal(await (await first.event.response).text(), 'export const ready = true')
  await first.settled()
  assert.ok(h.entries.has('https://air.test/js/example.js'))
  h.context.fetch = async () => { throw Error('offline') }
  const second = h.call('/js/example.js')
  assert.equal(await (await second.event.response).text(), 'export const ready = true')
  await second.settled()
})

await test('offline navigation preserves dashboard, install guide, and story identity', async () => {
  const h = workerHarness()
  for (const [key, body] of [['/ops.html', 'dashboard'], ['/index.html', 'story'], ['/install.html', 'install']]) h.entries.set(key, new Response(body))
  for (const [path, expected] of [['/ops?city=chiangmai', 'dashboard'], ['/Sikhio', 'dashboard'], ['/install', 'install'], ['/', 'story']]) {
    const { event } = h.call(path, 'navigate')
    assert.equal(await (await event.response).text(), expected)
  }
  const forced = h.call('/ops?forceReload=1', 'navigate')
  assert.equal((await forced.event.response).status, 503)
})

await test('offline documents strip Pages redirect history before answering navigation', async () => {
  const h = workerHarness()
  h.context.caches.match = async () => {
    const response = new Response('install guide', { headers: { 'content-type': 'text/html' } })
    Object.defineProperty(response, 'redirected', { value: true })
    return response
  }
  const response = await h.call('/install', 'navigate').event.response
  assert.equal(response.redirected, false)
  assert.equal(response.headers.get('content-type'), 'text/html')
  assert.equal(await response.text(), 'install guide')
})

await test('service worker never intercepts live API or POST requests and keeps unrelated caches', async () => {
  const h = workerHarness()
  assert.equal(h.call('/api/snapshot').event.response, undefined)
  assert.equal(h.call('/api/tap').event.response, undefined)
  assert.equal(h.call('/submit', 'cors', 'POST').event.response, undefined)
  const waits = []
  h.handlers.activate({ waitUntil: (p) => waits.push(p) })
  await Promise.all(waits)
  assert.ok(h.names.has('unrelated-cache'))
  assert.ok(!h.names.has('airdash-old'))
})

await test('watchdog reconnect refreshes state after losing the EventSource replay cursor', () => {
  let now = 1000, tick
  const events = [], sources = []
  class Source {
    static CONNECTING = 0
    readyState = 1
    constructor() { sources.push(this) }
    close() {}
    addEventListener() {}
  }
  const context = vm.createContext({ EventSource: Source, store: {}, emit: (name) => events.push(name), Date: { now: () => now },
    setInterval: (fn) => { tick = fn }, document: { addEventListener() {} } })
  const code = readFileSync('public/js/sse.js', 'utf8').replace(/^import .*$/gm, '').replace('export function', 'function')
  vm.runInContext(code + '\nstartTap()', context)
  sources[0].onopen()
  assert.equal(events.filter((e) => e === 'resync').length, 0)
  now += 61_000
  tick()
  sources[1].onopen()
  assert.equal(events.filter((e) => e === 'resync').length, 1)
})

await test('source connection timestamps alone cannot paint observations LIVE', () => {
  const listeners = {}, ticker = { dataset: {} }, pill = { setAttribute() {} }
  const context = vm.createContext({ Date, Number, Math, store: { lang: 'en' }, tr: (_th, en) => en,
    on: (name, fn) => { listeners[name] = fn }, setInterval() {}, setTimeout,
    newestObservationAgeMinAll: () => null, feedBand: () => 'ok', FEED_STALE_MIN: 90, FEED_ALARM_MIN: 180,
    document: { getElementById: () => pill, querySelector: () => ticker } })
  const code = readFileSync('public/js/dataFreshness.js', 'utf8').replace(/^import .*$/gm, '').replace('export function', 'function')
  vm.runInContext(code + '\ninitDataFreshness()', context)
  listeners.snapshot({ sources: { air4thai: { lastOk: new Date().toISOString() } } })
  assert.match(pill.textContent, /observation time unavailable/)
  assert.equal(ticker.dataset.band, 'unknown')
})

await test('Pages root stays an identity rewrite so HTML canonicalization cannot enter the dashboard fallback', () => {
  const redirects = readFileSync('public/_redirects', 'utf8')
  assert.match(redirects, /^\/\s+\/\s+200$/m)
  assert.doesNotMatch(redirects, /^\/\s+\/index\.html\s+200$/m)
})

const realFetch = globalThis.fetch
try {
  await test('Pages strips forged proxy identity and signs the Cloudflare-observed visitor', async () => {
    let forwarded
    globalThis.fetch = async (req) => { forwarded = req.headers; return new Response('{}', { headers: { 'x-service': 'airdash' } }) }
    const headers = { 'cf-connecting-ip': '198.51.100.9', 'x-airdash-client-ip': '198.51.100.66', 'x-airdash-client-signature': 'forged' }
    await onRequest({ request: new Request('https://air.test/api/health', { headers }), env: {} })
    assert.equal(forwarded.get('x-airdash-client-ip'), null)
    await onRequest({ request: new Request('https://air.test/api/health', { headers }), env: { AIRDASH_PROXY_SECRET: 'test-only-proxy-secret' } })
    assert.equal(forwarded.get('x-airdash-client-ip'), '198.51.100.9')
    assert.equal(forwarded.get('x-airdash-client-signature'), createHmac('sha256', 'test-only-proxy-secret').update('198.51.100.9').digest('hex'))
  })
  await test('proxy rejects declared or streamed oversized uploads without contacting a backend', async () => {
    globalThis.fetch = async () => { throw Error('backend must not be called') }
    const declared = new Request('https://air.test/api/chat', { method: 'POST', headers: { 'content-length': '1000000' }, body: '{}' })
    assert.equal((await onRequest({ request: declared, env: {} })).status, 413)
    let pulls = 0, cancelled = false
    const stream = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(128 * 1024)); }, cancel() { cancelled = true } })
    const streamed = new Request('https://air.test/api/chat', { method: 'POST', body: stream, duplex: 'half' })
    assert.equal((await onRequest({ request: streamed, env: {} })).status, 413)
    assert.ok(cancelled)
    assert.ok(pulls <= 4, 'upload must stop near the limit')
  })
  await test('archive download clears its header deadline before streaming the body', async () => {
    const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout
    let timer, cleared = false, signal
    try {
      globalThis.setTimeout = (fn) => { timer = fn; return 42 }
      globalThis.clearTimeout = (id) => { assert.equal(id, 42); cleared = true }
      globalThis.fetch = async (_req, options) => { signal = options.signal; return new Response('archive', {headers:{'x-service':'airdash'}}) }
      const response = await onRequest({request:new Request('https://air.test/api/exports/airdash-2026-10-02.tar.gz'), env:{}})
      assert.equal(cleared, true)
      assert.equal(signal.aborted, false)
      assert.equal(await response.text(), 'archive')
      assert.equal(typeof timer, 'function')
    } finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout }
  })
  await test('proxy write failure is never replayed on the backup; read failover still works', async () => {
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response('failed', { status: 500, headers: { 'x-service': 'airdash' } }) }
    const write = await onRequest({ request: new Request('https://air.test/api/admin/anything', { method: 'POST', body: '{}' }), env: {} })
    assert.equal(write.status, 500)
    assert.equal(calls, 1)
    calls = 0
    await onRequest({ request: new Request('https://air.test/api/health'), env: { AIRDASH_BACKUP: 'https://backup.air.test' } })
    assert.equal(calls, 2)
    calls = 0
    await onRequest({ request: new Request('https://air.test/api/health'), env: {} })
    assert.equal(calls, 1, 'no request to an unprovisioned backup')
  })
} finally { globalThis.fetch = realFetch }

await test('a timed-out ingestion cannot clear its replacement timer or overwrite its status', async () => {
  const timers = [], cleared = [], runs = []
  const context = vm.createContext({ Date, Map, String, Number, Math,
    log() {}, jitter: (n) => n,
    setTimeout(fn, ms) { const t = { fn, ms, unref() {} }; timers.push(t); return t },
    clearTimeout(t) { cleared.push(t) },
  })
  vm.runInContext(readFileSync('server/scheduler.js', 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '') + '\nthis.makeScheduler = createScheduler', context)
  let finishOld, finishNew, count = 0
  const source = { name: 'news', enabled: true, intervalMs: 1000,
    run: () => new Promise((resolve) => { if (++count === 1) finishOld = resolve; else finishNew = resolve }) }
  const scheduler = context.makeScheduler({ sources: [source], bus: { publish() {} },
    db: { recordRun: (r) => runs.push(r) } })
  const old = scheduler.runOnce('news')
  timers[0].fn() // hard timeout
  const replacement = scheduler.runOnce('news')
  const replacementTimer = timers.at(-1)
  finishOld({ seen: 99 })
  await old
  assert.equal(scheduler.health().news.running, true)
  assert.equal(scheduler.health().news.lastOk, null)
  assert.ok(!cleared.includes(replacementTimer))
  assert.equal(runs.length, 1)
  finishNew({ seen: 1 })
  await replacement
  assert.equal(scheduler.health().news.running, false)
  assert.equal(runs.length, 2)
  assert.equal(runs[1].rows_seen, 1)
})

await test('forecast, insights, and what-if render unavailable when their initial network request fails', async () => {
  for (const name of ['forecast', 'insights', 'whatif']) {
    let timer
    const box = { children: [], replaceChildren(...nodes) { this.children = nodes }, addEventListener() {} }
    const context = vm.createContext({
      document: { getElementById: () => box }, on() {}, store: {}, BAND: {},
      tr: (_, en) => en, fmtNum: String,
      el: (tag, attrs, ...children) => ({ tag, attrs, children }),
      getJson: async () => { throw Error('offline') },
      refreshSensorHealth: async () => {},
      setTimeout: (fn) => { timer = fn; return 1 }, clearTimeout() {},
    })
    const source = readFileSync(`public/js/panels/${name}.js`, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
    vm.runInContext(source + (name === 'whatif' ? '\nthis.init = initWhatIf' : '\nthis.refreshPanel = refresh'), context)
    if (name === 'whatif') { context.init(); await timer() } else await context.refreshPanel(box)
    assert.match(JSON.stringify(box.children), /unavailable/, name)
  }
})

await test('an older what-if response cannot overwrite a newer slider request', async () => {
  let input, timer
  const requests = []
  const box = { replaceChildren() {}, addEventListener(_, fn) { input = fn } }
  const context = vm.createContext({
    document: { getElementById: () => box }, on() {}, store: {}, BAND: {},
    tr: (_, en) => en, fmtNum: String, el: (tag, attrs, ...children) => ({ tag, attrs, children }),
    getJson: (url) => new Promise((resolve) => requests.push({ url, resolve })),
    setTimeout: (fn) => { timer = fn; return 1 }, clearTimeout() {},
  })
  vm.runInContext(readFileSync('public/js/panels/whatif.js', 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '') + '\nthis.init = initWhatIf', context)
  context.init()
  const older = timer()
  input({ target: { id: 'whatif-rain', value: '50' } })
  const newer = timer()
  const result = { summary: { high: 0, elevated: 0, watch: 0, normal: 0 }, relievers: [] }
  requests[1].resolve(result)
  await newer
  requests[0].resolve(result)
  await older
  assert.equal(vm.runInContext('lastDataRain', context), 50)
})

await test('direct clients cannot forge the Cloudflare visitor identity', () => {
  assert.equal(clientIp({ headers: { 'cf-connecting-ip': '198.51.100.9' },
    socket: { remoteAddress: '192.0.2.1' } }), '192.0.2.1')
})

await test('concurrent station alerts claim one Telegram delivery; auth failure restores eligibility', async () => {
  const db = openDb(':memory:')
  const originalFetch = globalThis.fetch
  try {
    db.kvSet('telegram_bot_token', 'test-only')
    db.run(`INSERT INTO telegram_subs (chat_id, province_th, lang, created_at, updated_at)
      VALUES (123, 'เชียงใหม่', 'th', datetime('now'), datetime('now'))`)
    const alert = { province_th: 'เชียงใหม่', severity: 3, rule: 'pm25_unhealthy' }
    let sends = 0
    globalThis.fetch = async () => { sends++; return new Response('{}', { status: 200 }) }
    await Promise.all([notifySubscribersForAlert(db, alert), notifySubscribersForAlert(db, alert)])
    assert.equal(sends, 1)
    const previous = '2020-01-01 00:00:00'
    db.run('UPDATE telegram_subs SET last_notified_at = ?', previous)
    globalThis.fetch = async () => new Response('Unauthorized', { status: 401 })
    await notifySubscribersForAlert(db, alert)
    const sub = db.get('SELECT last_notified_at, fail_count FROM telegram_subs WHERE chat_id = 123')
    assert.equal(sub.last_notified_at, previous)
    assert.equal(sub.fail_count, 0)
  } finally {
    globalThis.fetch = originalFetch
    db.raw.close()
  }
})

for (const [channel, tick, notify] of [['telegram', tickTelegramPush, notifySubscribersForAlert], ['line', tickLinePush, notifyLine]]) {
  await test(`${channel}: scheduled and immediate pushes share one slot and restore it on network failure`, async () => {
    const db = openDb(':memory:')
    const originalFetch = globalThis.fetch
    const table = `${channel}_subs`
    try {
      db.kvSet('telegram_bot_token', 'test-only')
      db.kvSet('risk_provinces', JSON.stringify([{ province_th: 'เชียงใหม่', band: 'high', score: 80 }]))
      const identity = channel === 'telegram' ? 'chat_id' : 'token'
      db.run(`INSERT INTO ${table} (${identity}, province_th, lang, created_at, updated_at)
        VALUES (?, 'เชียงใหม่', 'th', datetime('now'), datetime('now'))`, channel === 'telegram' ? 123 : 'test-token')
      const alert = { province_th: 'เชียงใหม่', severity: 3, rule: 'pm25_level' }
      let sends = 0
      globalThis.fetch = async () => { sends++; return new Response('{}', { status: 200 }) }
      await Promise.all([tick(db), notify(db, alert), tick(db)])
      assert.equal(sends, 1)
      const previous = '2020-01-01 00:00:00'
      db.run(`UPDATE ${table} SET last_notified_at = ?`, previous)
      globalThis.fetch = async () => { throw new Error('test network failure') }
      await tick(db)
      assert.equal(db.get(`SELECT last_notified_at FROM ${table}`).last_notified_at, previous)
    } finally {
      globalThis.fetch = originalFetch
      db.raw.close()
    }
  })
}

console.log(`\n${passed} passed, 0 failed`)
