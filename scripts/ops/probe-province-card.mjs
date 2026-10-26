// Photograph the province card as the browser actually draws it.
//
// WHY THIS EXISTS
// The province card is the one surface where a reader asks "how bad is it
// here, and what is coming?" — so every change to it has to be seen, not
// assumed. This probe opens the map, clicks a province, waits for the
// popup, and reports its geometry and text.
//
// Usage:
//   node scripts/ops/probe-province-card.mjs [url] [width] [height] [province]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9800 + (process.pid % 180)
const URL = process.argv[2] ?? 'https://air.nonarkara.org/ops'
const W = Number(process.argv[3] ?? 1440)
const H = Number(process.argv[4] ?? 900)
const WANT = process.argv[5] ?? 'Chiang Mai'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-card-${PORT}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page') } catch {}
}
if (!target) { console.error('no target'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1; const pending = new Map()
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.text }; return r.result?.value }

const READ_CARD = `(() => {
  const el = document.querySelector('.leaflet-popup-content')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const rows = [...el.querySelectorAll('.pop-kv')].map(k => {
    const kr = k.getBoundingClientRect()
    return { k: k.querySelector('span')?.textContent?.trim(), v: k.querySelector('.v')?.textContent?.trim(), h: Math.round(kr.height) }
  })
  return {
    identity: [...el.querySelectorAll('.pop-name,.pop-en')].map(n => n.textContent.trim()).join(' | '),
    text: el.innerText.replace(/\\n+/g, ' | ').trim(),
    box: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) },
    rows,
    html: el.innerHTML.slice(0, 4000),
    hasSvg: !!el.querySelector('svg'),
    hasCanvas: !!el.querySelector('canvas'),
  }
})()`
const readCard = async () => await evaluate(READ_CARD)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: URL })
const ready = await waitForLiveData(evaluate, sleep)
console.log(`page ready: ${ready.ok} ${ready.reason ?? ''} (${ready.waited_ms}ms)`)
if (!ready.ok) { console.error('FATAL: no live data; no visual pass'); ws.close(); child.kill(); process.exit(2) }

// Find the province layer and the screen point of its centre.
const FIND = `(() => {
  const A = window.__airdash
  if (!A) return { error: 'no map hook' }
  const wanted = ${JSON.stringify(WANT)}
  let hit = null
  // The zone group holds one GeoJSON group per province, and each of those
  // holds the feature layer — so the search walks down until it finds the
  // feature that carries the name.
  const walk = (layer, depth) => {
    if (hit || depth > 4) return
    const p = layer?.feature?.properties
    if (p && (p.pro_en === wanted || p.pro_th === wanted)) { hit = { p, layer }; return }
    if (typeof layer?.eachLayer === 'function') layer.eachLayer(l => walk(l, depth + 1))
  }
  walk(A.layers.boundaries, 0)
  if (!hit) return { error: 'province not found: ' + wanted }
  window.__probeHit = hit
  const c = hit.layer.getBounds().getCenter()
  const pt = A.map.latLngToContainerPoint(c)
  const box = A.map.getContainer().getBoundingClientRect()
  return { lat: c.lat, lng: c.lng, x: pt.x + box.left, y: pt.y + box.top, name: hit.p.pro_en, names: [hit.p.pro_en, hit.p.pro_th].filter(Boolean) }
})()`
let last = null
const found = await (async () => {
  // The boundary layer loads asynchronously (1.6 MB of GeoJSON), so the
  // province may not be on the map yet when the data arrives.
  for (let i = 0; i < 40; i++) {
    last = await evaluate(FIND)
    if (last && !last.error) return last
    await sleep(1500)
  }
  return last
})()
if (!found || found.error) {
  const sample = await evaluate(`JSON.stringify((() => {
    const A = window.__airdash
    const names = []
    A.layers.boundaries?.eachLayer(f => names.push(JSON.stringify(f.feature?.properties ?? {}).slice(0, 160)))
    return { count: names.length, names: names.slice(0, 8) }
  })())`)
  console.error(found?.error ?? 'province lookup unavailable', '\nsample:', sample)
  ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1)
}
console.log(`province: ${found.name} at screen ${Math.round(found.x)},${Math.round(found.y)}`)

// Click it — the zone areas are painted on a canvas, so this is a real click
// through the map's own hit-testing, not a synthetic event on a path.
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: found.x, y: found.y, button: 'none', clickCount: 0 })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: found.x, y: found.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: found.x, y: found.y, button: 'left', clickCount: 1 })

// A province's bounds centre is not always inside the province itself (islands,
// concave shapes), so a click there can miss. If no card opened, open the very
// same popup through the layer — the card is one function, either way.
let opening = 'map-hit-test'
let card = null
for (let i = 0; i < 10; i++) {
  await sleep(600)
  card = await readCard()
  if (card) break
}
if (!card) {
  opening = 'layer-open fallback (map click did not open a card)'
  await evaluate(`(() => {
    const A = window.__airdash, hit = window.__probeHit
    if (!hit) return 'no hit'
    A.map.setView([hit.layer.getBounds().getCenter().lat, hit.layer.getBounds().getCenter().lng], 6)
    hit.layer.openPopup()
    return 'opened'
  })()`)
  for (let i = 0; i < 12; i++) {
    await sleep(700)
    card = await readCard()
    if (card) break
  }
}
if (!card) { console.error('no popup appeared'); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }

if (![WANT, ...(found.names ?? [])].some(name => card.identity.toLowerCase().includes(name.toLowerCase()))) {
  console.error('FATAL: clicked popup does not identify requested province', WANT, card.identity)
  ws.close(); child.kill(); process.exit(1)
}
console.log('\n── the card ──')
console.log('opening:', opening)
console.log('box:', JSON.stringify(card.box))
console.log('text:', card.text)
console.log('rows:', JSON.stringify(card.rows))
console.log('svg:', card.hasSvg, 'canvas:', card.hasCanvas)
console.log('\n── html ──\n' + card.html)

const shot = await send('Page.captureScreenshot', { format: 'png' })
const path = `/tmp/province-card-${W}.png`
writeFileSync(path, Buffer.from(shot.data, 'base64'))
console.log(`\nshot: ${path}`)
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
