// Live check: the province wind field as the browser draws it.
//
// WHY THIS EXISTS
// The wind field answers two questions at once — where the air is going and
// how hard it is blowing — and the SECOND one is carried by the arrow's
// SIZE. A size is the easiest thing in the world to get wrong in a way no
// source check can see: the code can call windArrowSize() correctly and the
// page can still draw seventy-seven identical arrows, because something
// upstream (a missing speed, a stale snapshot, a CSS width) flattened the
// scale. The only place that truth lives is the drawn DOM.
//
// So this reads the DRAWN arrows: how many, how big, whether the sizes vary,
// and whether the set of drawn sizes is exactly the set the payload implies.
// The expected sizes are computed with the product's own function, imported
// here — the check never restates the scale.
//
// It also photographs the map at 390, 1024 and 1440 and measures the wind
// arrows against the province marks they share a centroid with, because a
// 30px arrow sitting on a 20px circle can be a lid rather than a mark.
//
// Usage: node scripts/ops/check-wind-field.mjs [url]
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
// The product's own scale — never a copy of it.
const TOKEN = readFileSync(join(ROOT, 'public/ops.html'), 'utf8').match(/\?v=(\d+\.\d+\.\d+)/)?.[1] ?? ''
const { windArrowSize, WIND_ARROW } = await import(`../../public/js/wind.js${TOKEN ? `?v=${TOKEN}` : ''}`)

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const PAGE_URL = process.argv[2] ?? 'https://air.nonarkara.org/'
const API = PAGE_URL.includes('/ops') ? PAGE_URL.replace(/\/ops\.html.*$/, '') + '/api/snapshot' : new URL('/api/snapshot', PAGE_URL).href
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-wind-${PORT}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page') } catch {}
}
if (!target) { console.error('no target'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1; const pending = new Map(); const errors = []
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text)
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.text }; return r.result?.value }

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: PAGE_URL })
const ready = await waitForLiveData(evaluate, sleep)
console.log(`page ready: ${ready.ok} ${ready.reason ?? ''} (${ready.waited_ms}ms)`)
if (!ready.ok) { ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
await sleep(6000)

// ── what the payload says ─────────────────────────────────────────────────
const snap = await (await fetch(API)).json()
const provs = (snap.risk?.provinces ?? []).filter(p => Number.isFinite(p.wind_dir_deg) && Number.isFinite(p.lat) && Number.isFinite(p.lng))
const expected = provs.map(p => windArrowSize(p.wind_fc_kmh).size)
const expectedCounts = {}
for (const s of expected) expectedCounts[s] = (expectedCounts[s] ?? 0) + 1
console.log(`payload: ${provs.length} provinces with a bearing; speeds ${Math.min(...provs.map(p => p.wind_fc_kmh ?? 0)).toFixed(1)}–${Math.max(...provs.map(p => p.wind_fc_kmh ?? 0)).toFixed(1)} km/h`)

const READ = `JSON.stringify((() => {
  const A = window.__airdash
  if (!A) return { error: 'no map hook' }
  const icons = [...document.querySelectorAll('.haze-wind-icon')]
  const arrows = icons.map(el => {
    const svg = el.querySelector('svg')
    return {
      w: Number(svg?.getAttribute('width')),
      h: Number(svg?.getAttribute('height')),
      faded: /no-strength/.test(el.className || ''),
      rotate: (svg?.style?.transform || '') + ' ' + (svg?.getAttribute('style') || ''),
    }
  })
  const counts = {}
  for (const a of arrows) counts[a.w] = (counts[a.w] ?? 0) + 1
  const legendRow = [...document.querySelectorAll('.legend-body .lrow')].find(r => r.querySelector('.lrow-arrow'))
  const legendArrows = legendRow ? [...legendRow.querySelectorAll('svg')].map(s => Number(s.getAttribute('width'))) : []
  // The province mark the arrows share a centroid with: the watch-score ring.
  const rings = [...document.querySelectorAll('.leaflet-overlay-pane path')].slice(0, 200)
  const box = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
  const boxes = icons.map(el => box(el)).filter(b => b.w > 0)
  let worstOverlap = 0, pairs = 0
  for (const a of boxes) for (const m of rings.map(box)) {
    if (!m.w || !m.h) continue
    const ox = Math.max(0, Math.min(a.x + a.w, m.x + m.w) - Math.max(a.x, m.x))
    const oy = Math.max(0, Math.min(a.y + a.h, m.y + m.h) - Math.max(a.y, m.y))
    const frac = (ox * oy) / Math.min(a.w * a.h, m.w * m.h)
    if (frac > 0.5) { pairs++; worstOverlap = Math.max(worstOverlap, frac) }
  }
  return {
    windOn: A.map.hasLayer(A.layers.hazeWind),
    riskOn: A.map.hasLayer(A.layers.risk),
    count: arrows.length,
    counts,
    sizes: Object.keys(counts).map(Number).sort((x, y) => x - y),
    min: Math.min(...arrows.map(a => a.w)),
    max: Math.max(...arrows.map(a => a.w)),
    faded: arrows.filter(a => a.faded).length,
    rotations: [...new Set(arrows.map(a => a.rotate.match(/rotate\\([^)]*\\)/)?.[0]).filter(Boolean))].slice(0, 6),
    legendArrows,
    legendText: legendRow ? (legendRow.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    arrowBoxes: boxes.length,
    worstOverlap: Number(worstOverlap.toFixed(2)),
    pairs,
  }
})())`

let state = null
let readError = null
for (let i = 0; i < 30; i++) {
  await sleep(2000)
  const raw = await evaluate(READ)
  if (raw?.__error) { readError = raw.__error; continue }
  state = JSON.parse(raw)
  if (state?.count) break
}
console.log('drawn:', JSON.stringify(state))
if (readError) console.log('read error:', readError)

let failures = 0
const check = (name, cond, why = '') => { cond ? console.log(`PASS ${name}`) : (failures++, console.log(`FAIL ${name} — ${why}`)) }

// A read that failed must FAIL the check, never pass it vacuously: an
// earlier version of this script read the page into `null` and every
// "every arrow is within the scale" assertion passed on an empty array.
check('the page could be read at all', state !== null && state.count > 0,
  `the wind field could not be read from the DOM${readError ? ` (${readError})` : ''}`)

check('the wind field is on the map without being asked for', state?.windOn === true, `windOn=${state?.windOn}`)
check('one arrow per province that carries a bearing',
  state?.count === provs.length, `drew ${state?.count}, payload has ${provs.length}`)
check('the drawn sizes are exactly the sizes the payload implies',
  JSON.stringify(state?.counts ?? {}) === JSON.stringify(expectedCounts),
  `drawn ${JSON.stringify(state?.counts)} vs expected ${JSON.stringify(expectedCounts)}`)
check('the arrows are not all the same size — the strength is encoded',
  (state?.sizes?.length ?? 0) >= 2, `sizes ${JSON.stringify(state?.sizes)}`)
check('every arrow stays inside the drawn scale',
  (state?.sizes ?? []).length > 0 && (state?.sizes ?? []).every(s => s >= WIND_ARROW.MIN && s <= WIND_ARROW.MAX),
  `sizes ${JSON.stringify(state?.sizes)} vs scale ${WIND_ARROW.MIN}–${WIND_ARROW.MAX}`)
check('the arrows point in more than one direction',
  (state?.rotations?.length ?? 0) >= 2, `rotations ${JSON.stringify(state?.rotations)}`)
check('the legend’s key shows two different arrow sizes',
  (state?.legendArrows?.length ?? 0) === 2 && state.legendArrows[0] !== state.legendArrows[1],
  `legend arrows ${JSON.stringify(state?.legendArrows)}`)
check('the legend states the rule the sizes encode',
  /stronger the wind|ลมแรงขึ้น/.test(state?.legendText ?? ''), `legend text: ${(state?.legendText ?? '').slice(0, 140)}`)

// The tooltip has to name the speed: the size is a summary, the tooltip is
// the number.
const tip = await evaluate(`(async () => {
  const el = document.querySelector('.haze-wind-icon')
  if (!el) return 'no arrow'
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  await new Promise(r => setTimeout(r, 600))
  const t = document.querySelector('.leaflet-tooltip')
  return t ? (t.textContent || '').replace(/\\s+/g, ' ').trim() : 'no tooltip'
})()`)
console.log('tooltip:', tip)
check('the arrow’s tooltip names the speed', /km\/h|กม\.\/ชม\./.test(String(tip)), String(tip))

// ── the MSH evidence: three viewports, photographed ───────────────────────
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await sleep(2500)
  if (w < 500) {
    await evaluate(`(() => { const b = document.querySelector('#sheettabs button[data-sheet="map"]'); if (b) b.click(); return 1 })()`)
    await sleep(3500)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `/tmp/windfield-${w}.png`
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log(`→ ${file}`)
}

// The worst case: the province marks AND the arrows on the same centroid.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await sleep(2500)
const both = await evaluate(`(() => {
  const A = window.__airdash
  if (!A?.layers?.risk) return 'no risk layer'
  A.map.addLayer(A.layers.risk)
  return 'risk layer on'
})()`)
console.log('worst case:', both)
await sleep(2500)
const shot2 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/tmp/windfield-both.png', Buffer.from(shot2.data, 'base64'))
console.log('→ /tmp/windfield-both.png')

console.log(`\n${failures} failed`)
console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(failures ? 1 : 0)
