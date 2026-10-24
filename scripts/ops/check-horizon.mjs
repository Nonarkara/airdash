// Live check: the zone's horizon, as the browser paints it.
//
// WHY THIS EXISTS
// The horizon is the one thing on the map that paints a MODEL. Everything
// else on the zone is measured. A model painted like a measurement is the
// most dangerous thing this dashboard could do — and the source cannot tell
// you it happened: the layer's options can say "red" while the canvas
// paints something else, or the model can quietly reach for the ground
// reading and say "everything improves tomorrow".
//
// So this reads the DRAWN map: the control's state, the areas' fill
// attributes, the pixels on the canvas, the legend's key and its counts,
// and the tooltip. It then switches back to the present and checks the
// band palette came back — a mode switch that cannot be undone is a switch
// the reader cannot leave.
//
// Usage: node scripts/ops/check-horizon.mjs [url]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const PAGE_URL = process.argv[2] ?? 'https://air.nonarkara.org/ops'
const API = new URL('/api/outlook', PAGE_URL).href
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-horizon-${PORT}-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: PAGE_URL })
const ready = await waitForLiveData(evaluate, sleep)
console.log(`page ready: ${ready.ok} ${ready.reason ?? ''} (${ready.waited_ms}ms)`)
if (!ready.ok) { ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
await sleep(5000)

// ── the model's own numbers, for the cross-check ──────────────────────────
const outlook = await (await fetch(API)).json()
console.log(`outlook: available=${outlook.available} frames=${outlook.frames?.length ?? 0} points=${outlook.points?.length ?? 0} (${outlook.calibration ?? 'n/a'})`)

const READ = `JSON.stringify((() => {
  const A = window.__airdash
  if (!A) return { error: 'no map hook' }
  const fills = []
  const samples = []
  const canvas = A.map.getPane('vectors')?.querySelector('canvas')
  const ctx = canvas ? canvas.getContext('2d') : null
  A.layers.boundaries?.eachLayer(l => l.eachLayer(f => {
    const o = f.options || {}
    fills.push(o.fillColor ?? null)
    const ll = f.getBounds ? f.getBounds().getCenter() : null
    if (ctx && ll && samples.length < 40) {
      const pt = A.map.latLngToContainerPoint(ll)
      if (pt.x > 0 && pt.y > 0 && pt.x < canvas.width && pt.y < canvas.height) {
        const d = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data
        if (d[3] > 0) samples.push({ r: d[0], g: d[1], b: d[2] })
      }
    }
  }))
  const rows = [...document.querySelectorAll('.horizon-ctl .row')]
  const legendCounts = [...document.querySelectorAll('.legend-body .zcount')]
  return {
    horizonRows: rows.map(r => ({ h: r.dataset.horizon, on: r.classList.contains('on'), label: (r.textContent || '').trim() })),
    note: (document.querySelector('.horizon-ctl .mapctl-note')?.textContent || '').trim(),
    fills: [...new Set(fills)],
    fillCount: fills.length,
    samples,
    legendEyebrow: document.querySelector('.legend-body .eyebrow')?.textContent?.trim() ?? '',
    legendCounts: legendCounts.map(e => (e.dataset.change ?? 'band:' + e.dataset.band) + ':' + e.textContent),
    changes: [...document.querySelectorAll('.legend-body .zcount[data-change]')].length,
  }
})())`

const CLICK = (h) => `(() => {
  const r = [...document.querySelectorAll('.horizon-ctl .row')].find(x => x.dataset.horizon === '${h}')
  if (!r) return 'no row ${h}'
  r.click()
  return 'clicked ${h}'
})()`

let failures = 0
const check = (name, cond, why = '') => { cond ? console.log(`PASS ${name}`) : (failures++, console.log(`FAIL ${name} — ${why}`)) }

const readState = async () => {
  for (let i = 0; i < 20; i++) {
    await sleep(2000)
    const raw = await evaluate(READ)
    if (raw?.__error) continue
    return JSON.parse(raw)
  }
  return null
}

// ── 1 · the present ───────────────────────────────────────────────────────
let state = await readState()
check('the page could be read at all', state !== null && state?.fillCount > 0, `state ${JSON.stringify(state)?.slice(0, 120)}`)
check('the horizon control offers now and the days ahead',
  (state?.horizonRows ?? []).length >= 4 && state.horizonRows.some(r => r.h === '0') && state.horizonRows.some(r => r.h === '24'),
  JSON.stringify(state?.horizonRows))
check('the map starts at the present', state?.horizonRows?.find(r => r.h === '0')?.on === true,
  JSON.stringify(state?.horizonRows?.find(r => r.h === '0')))
check('at the present the areas carry the band palette',
  (state?.fills ?? []).some(f => /^#[0-9a-f]{6}$/i.test(f ?? '')) && (state?.fills ?? []).every(f => !/^#A51931$/i.test(f ?? '')),
  `fills ${JSON.stringify(state?.fills)}`)
check('the legend names the band at the present',
  /PROVINCE AIR ZONE|โซนอากาศรายจังหวัด/.test(state?.legendEyebrow ?? ''), state?.legendEyebrow)

// ── 2 · a horizon ─────────────────────────────────────────────────────────
await evaluate(CLICK('24'))
await sleep(6000)
state = await readState()
check('the horizon took effect', state?.horizonRows?.find(r => r.h === '24')?.on === true,
  JSON.stringify(state?.horizonRows))
check('the areas now carry the CHANGE palette, not the band palette',
  (state?.fills ?? []).some(f => /^#A51931$/i.test(f ?? '')) && (state?.fills ?? []).every(f => !/^#00933C$/i.test(f ?? '')),
  `fills ${JSON.stringify(state?.fills)}`)
check('no area is left unpainted',
  (state?.fills ?? []).every(f => /^#[0-9a-f]{6}$/i.test(f ?? '')), `fills ${JSON.stringify(state?.fills)}`)
check('the legend names the horizon',
  /CHANGE|เปลี่ยนแปลง/.test(state?.legendEyebrow ?? ''), state?.legendEyebrow)
check('the legend counts the provinces by change',
  (state?.changes ?? 0) === 4, `${state?.changes} change counters`)
const counted = (state?.legendCounts ?? []).filter(c => c.startsWith('worse') || c.startsWith('steady') || c.startsWith('better') || c.startsWith('unknown'))
  .map(c => Number(c.split(':')[1]))
check('the legend’s change counts add up to 77',
  counted.length === 4 && counted.reduce((a, b) => a + b, 0) === 77, `counts ${JSON.stringify(counted)}`)

// The painted pixels: the change colour on the canvas, not only the options.
// The fill is 50% opaque over a light basemap, so a per-channel distance to
// the pure hex is the wrong test — the hue family is what survives a blend.
const isChangePixel = s => (s.r > s.g + 25 && s.r > s.b + 5)          // worse (red)
  || (s.b > s.r + 15)                                                // better (blue)
  || (Math.abs(s.r - s.g) < 14 && Math.abs(s.b - s.g) < 16)           // steady / unknown
const offPalette = (state?.samples ?? []).filter(s => !isChangePixel(s))
check('every painted province pixel is a change colour', offPalette.length === 0,
  JSON.stringify(offPalette.slice(0, 3)))

// The tooltip has to name the model and the change.
const tip = await evaluate(`(async () => {
  const A = window.__airdash
  let el = null
  A.layers.boundaries?.eachLayer(l => l.eachLayer(f => { if (!el && f.getBounds) el = f }))
  const p = f => f.getBounds().getCenter()
  const target = el ? A.map.latLngToContainerPoint(p(el)) : null
  const node = target ? document.elementFromPoint(target.x, target.y) : null
  const svg = document.querySelector('.leaflet-overlay-pane')
  return 'manual'
})()`)
// The tooltip is bound on the vector layer, so read it from the layer's own
// binding instead of driving the mouse.
const tipText = await evaluate(`(() => {
  const A = window.__airdash
  let txt = null
  A.layers.boundaries?.eachLayer(l => l.eachLayer(f => {
    if (txt) return
    const t = f.getTooltip?.()
    if (t) txt = (t.getContent?.() || t._content || '')
  }))
  return txt
})()`)
console.log('tooltip:', String(tipText).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 160))
check('the tooltip names the model and the change',
  /model|แบบจำลอง/.test(String(tipText)) && /→|µg/.test(String(tipText)), String(tipText).slice(0, 120))

// ── 3 · back to the present ───────────────────────────────────────────────
await evaluate(CLICK('0'))
await sleep(4000)
state = await readState()
check('the map returns to the present', state?.horizonRows?.find(r => r.h === '0')?.on === true,
  JSON.stringify(state?.horizonRows?.find(r => r.h === '0')))
check('the band palette came back with it',
  (state?.fills ?? []).some(f => /^#00933C$/i.test(f ?? '')), `fills ${JSON.stringify(state?.fills)}`)

// ── 4 · the MSH evidence: three viewports, photographed ───────────────────
await evaluate(CLICK('24'))
await sleep(4000)
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await sleep(2500)
  if (w < 500) {
    await evaluate(`(() => { const b = document.querySelector('#sheettabs button[data-sheet="map"]'); if (b) b.click(); return 1 })()`)
    await sleep(3500)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `/tmp/horizon-${w}.png`
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log(`→ ${file}`)
}

console.log(`\n${failures} failed`)
console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(failures ? 1 : 0)
