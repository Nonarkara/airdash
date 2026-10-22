// Turn the province wind field on and look at it.
//
// WHY THIS EXISTS
// The wind field is drawn from the risk payload: one arrow per province that
// carries a bearing, rotated to the DOWNWIND angle, with the speed beside it.
// The guard proves it draws correctly; nobody has LOOKED at it. Seventy-seven
// arrows over a map that already carries seventy-seven province risk markers
// is exactly the kind of thing that is correct in code and unreadable on
// screen — spatial hallucination made of real data.
//
// This turns the layer on through the real layer control (not by poking
// module state), photographs it at 1440 and 390, and measures the overlap
// between the wind arrows and the risk markers they sit next to.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-wind-${process.pid}`, 'about:blank'], { stdio: 'ignore' })
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
  }
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''); return r.result?.value }

await send('Page.enable'); await send('Runtime.enable')
// Pin the colour scheme: a photo in dark mode is a different composition and
// the point of this check is to read the map, not to compare themes.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await send('Page.navigate', { url: URL })
await sleep(3000)
const landed = await evaluate('JSON.stringify({href: location.href, title: document.title})')
let ok = false
try { const l = JSON.parse(landed); ok = l.href.includes('/ops') && /AIRDASH/i.test(l.title); console.log(`landed: ${l.href}`) } catch {}
if (!ok) { console.error('FATAL: wrong page'); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
const ready = await waitForLiveData(evaluate, sleep)
if (!ready.ok) { console.error(`FATAL: ${ready.reason} after ${Math.round(ready.waited_ms / 1000)}s — refusing to measure a page that is not live.`) ; ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
console.log(`live in ${Math.round(ready.waited_ms / 1000)}s`)
await sleep(11000)

for (const [w, h] of [[1440, 900], [390, 844]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await sleep(4000)
  // On a phone the map lives behind its own tab; open it, or the layer
  // control does not exist to be opened.
  if (w < 500) {
    await evaluate(`(() => { const b = document.querySelector('#sheettabs button[data-sheet="map"]'); if (b) b.click(); return 'map-tab'; })()`)
    await sleep(5000)
  }
  // Expand the layer control and switch the wind field on, the way a person
  // would. The row is found by its label, which is also a check that the
  // toggle a reader sees is the one that draws the arrows.
  const toggled = await evaluate(`(() => {
    const head = [...document.querySelectorAll('.mapctl .head')].find(b => b.getBoundingClientRect().height > 0);
    if (!head) return 'no-layer-control';
    head.click();
    const rows = [...document.querySelectorAll('.mapctl .row')];
    const row = rows.find(r => (r.innerText||'').includes('ทิศลมรายจังหวัด') || (r.innerText||'').toLowerCase().includes('province wind field'));
    if (!row) return 'no-wind-row:' + rows.map(r => (r.innerText||'').slice(0,20)).join('|');
    if (!row.classList.contains('on')) row.click();
    return 'toggled:' + (row.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60);
  })()`)
  console.log(`${w}x${h} layer control: ${toggled}`)
  // Collapse the control again — left open it covers the map it is meant to
  // describe, and the point is to read the arrows.
  await evaluate(`(() => { const head = [...document.querySelectorAll('.mapctl .head')].find(b => b.getBoundingClientRect().height > 0); if (head && head.getAttribute('aria-expanded') === 'true') head.click(); return 'collapsed'; })()`)
  await sleep(6000)

  const report = await evaluate(`(() => {
    const arrows = [...document.querySelectorAll('.haze-wind-icon')];
    const markers = [...document.querySelectorAll('.leaflet-marker-icon')];
    const box = el => { const b = el.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; };
    const b2 = arrows.map(box).filter(b => b.w > 0);
    // Does an arrow sit on top of a risk marker? Count the pairs that
    // overlap by more than a third of the smaller box.
    let overlaps = 0;
    for (const a of b2) for (const m of markers.map(box)) {
      if (!m.w) continue;
      const ox = Math.max(0, Math.min(a.x+a.w, m.x+m.w) - Math.max(a.x, m.x));
      const oy = Math.max(0, Math.min(a.y+a.h, m.y+m.h) - Math.max(a.y, m.y));
      const area = ox*oy;
      if (area > 0.33 * Math.min(a.w*a.h, m.w*m.h)) { overlaps++; break; }
    }
    const rot = arrows.slice(0,3).map(a => a.querySelector('.wind-arrow')?.style.transform || '');
    const speeds = arrows.map(a => (a.innerText||'').trim()).filter(Boolean).slice(0,4);
    return JSON.stringify({
      arrows: arrows.length, visibleArrows: b2.length, riskMarkers: markers.length,
      overlaps, sampleRotations: rot, sampleLabels: speeds,
      arrowSize: b2[0] ? {w: b2[0].w, h: b2[0].h} : null,
      mapBox: box(document.querySelector('.leaflet-container')),
    }, null, 1);
  })()`)
  console.log(report)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `/tmp/wind-${w}.png`
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log(`→ ${file}\n`)
}
console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
