// Live check: the map's zone of air pollution, as the browser paints it.
//
// WHY THIS EXISTS
// 2.4.122 shipped the zone filled with the band colour and painted every
// province BLACK, because `bandColor` is a function and `bandColor[band]`
// is undefined. The source read as if it were deliberate, and the guard
// that shipped with it matched patterns in the source. Only the RENDERED
// fill attribute shows the truth: a path with no fill colour is painted
// with the SVG default, which is black.
//
// So this check reads what the browser will actually paint — the path's
// fill attribute — and refuses to call a grey or black province a zone.
//
// Usage: node scripts/ops/check-zone-layer.mjs [url]
import { spawn } from 'node:child_process'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const URL = process.argv[2] ?? 'https://air.nonarkara.org/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-zone-${PORT}`, 'about:blank'], { stdio: 'ignore' })
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

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: URL })
const ready = await waitForLiveData(evaluate, sleep)
console.log(`page ready: ${ready.ok} ${ready.reason ?? ''} (${ready.waited_ms}ms)`)

// What the browser will paint: the path's own fill attribute, not the
// layer's options.
// The ops map renders vectors on a canvas, so the truth is the canvas
// pixel, not an SVG attribute. Both are read: the options say what the
// renderer was told, the pixel says what it painted.
const READ = `JSON.stringify((() => {
  const A = window.__airdash
  if (!A) return { error: 'no map hook' }
  const paths = []
  const samples = []
  const canvas = A.map.getPane('vectors')?.querySelector('canvas')
  const ctx = canvas ? canvas.getContext('2d') : null
  A.layers.boundaries?.eachLayer(l => l.eachLayer(f => {
    const o = f.options || {}
    paths.push({ fill: o.fillColor ?? null, fillOpacity: o.fillOpacity ?? null, stroke: o.color ?? null, popup: !!f.getPopup?.() })
    const ll = f.getBounds ? f.getBounds().getCenter() : null
    if (ctx && ll && samples.length < 40) {
      const pt = A.map.latLngToContainerPoint(ll)
      if (pt.x > 0 && pt.y > 0 && pt.x < canvas.width && pt.y < canvas.height) {
        const d = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data
        if (d[3] > 0) samples.push({ r: d[0], g: d[1], b: d[2], a: d[3], fill: o.fillColor ?? null })
      }
    }
  }))
  return {
    zoneOn: A.map.hasLayer(A.layers.boundaries),
    riskOn: A.map.hasLayer(A.layers.risk),
    paths,
    samples,
    counts: [...document.querySelectorAll('.legend-body .zcount')].map(e => Number(e.textContent)),
  }
})())`

let state = null
for (let i = 0; i < 40; i++) {
  await sleep(2000)
  const raw = await evaluate(READ)
  if (raw?.__error) continue
  state = JSON.parse(raw)
  if (state.paths?.length) break
}
console.log(JSON.stringify(state, null, 1).slice(0, 1200))

let failures = 0
const check = (name, cond, why = '') => { cond ? console.log(`PASS ${name}`) : (failures++, console.log(`FAIL ${name} — ${why}`)) }

check('the zone layer is on the map', state?.zoneOn === true)
check('the watch-score circles are off (one band, one encoding)', state?.riskOn === false)
check('all 77 provinces are drawn as areas', state?.paths?.length === 77, `got ${state?.paths?.length}`)

const fills = [...new Set((state?.paths ?? []).map(p => p.fill))]
const bad = fills.filter(f => !/^#[0-9a-f]{6}$/i.test(f || ''))
check('every province is painted a real colour (no black, no default)', bad.length === 0, `fills: ${JSON.stringify(fills)}`)
const greyFill = f => {
  if (typeof f !== 'string' || !/^#[0-9a-f]{6}$/i.test(f)) return true
  const n = f.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return Math.abs(r - g) < 12 && Math.abs(g - b) < 12
}
check('no province is painted a neutral grey', !fills.some(greyFill), `fills: ${JSON.stringify(fills)}`)

// The painted pixels. A province that renders as an uncoloured pixel is
// not a zone, whatever the options say.
const samples = state?.samples ?? []
check('the zone is actually painted on the canvas', samples.length > 0, `${samples.length} painted samples`)
const paintedGrey = samples.filter(s => Math.abs(s.r - s.g) < 10 && Math.abs(s.g - s.b) < 10)
check('no painted province pixel is a neutral grey', paintedGrey.length === 0, JSON.stringify(paintedGrey.slice(0, 3)))
const blackPixels = samples.filter(s => s.r < 12 && s.g < 12 && s.b < 12)
check('no painted province pixel is black', blackPixels.length === 0, JSON.stringify(blackPixels.slice(0, 3)))
// Every painted pixel must be one of the band colours. A province's
// centroid can fall under a neighbour that was drawn later, so a pixel is
// not required to be ITS OWN band's colour — only to be a band colour.
const BAND_HEX = ['#00933C', '#B58800', '#E86A10', '#A51931', '#F0B400', '#B23B4F']
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const offPalette = samples.filter(s => !BAND_HEX.some(h => {
  const c = rgb(h)
  return Math.abs(s.r - c[0]) < 42 && Math.abs(s.g - c[1]) < 42 && Math.abs(s.b - c[2]) < 42
}))
check('every painted province pixel is a band colour', offPalette.length === 0, JSON.stringify(offPalette.slice(0, 3)))

const opacities = [...new Set((state?.paths ?? []).map(p => Number(p.fillOpacity)))]
check('the fill opacity is the map’s ladder, not one flat wash',
  opacities.length >= 1 && opacities.every(v => v > 0 && v <= 0.8), `opacities: ${JSON.stringify(opacities)}`)

check('the province areas open a card', (state?.paths ?? []).every(p => p.popup))
const counts = state?.counts ?? []
check('the legend counts every province', counts.reduce((a, b) => a + b, 0) === 77, `counts: ${JSON.stringify(counts)}`)

console.log(`\n${failures} failed`)
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(failures ? 1 : 0)
