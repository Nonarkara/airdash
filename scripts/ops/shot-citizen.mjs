// Shoot the citizen panel — the surface that matters most for "people who
// need it" — at phone and desktop widths, and report the wind block's
// geometry so the new feature is measured, not assumed.
//
// The driver asserts it landed on the right page before photographing
// anything: a screenshot of the wrong page is worse than no screenshot.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'

const CHROME = requireChrome()
const PORT = 9500 + (process.pid % 300)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html?city=Chiang%20Mai'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-citizen-${process.pid}`, 'about:blank'], { stdio: 'ignore' })
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

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Page.navigate', { url: URL })
await sleep(3500)
const landed = await evaluate('JSON.stringify({href: location.href, title: document.title})')
let ok = false
try { const l = JSON.parse(landed); ok = l.href.includes('/ops') && /AIRDASH/i.test(l.title); console.log(`landed: ${l.href}`) } catch {}
if (!ok) { console.error('FATAL: wrong page'); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }

for (let i = 0; i < 120; i++) { await sleep(2000); if (await evaluate('!document.getElementById("boot")')) break }
await sleep(11000)

for (const [w, h] of [[390, 844], [1440, 900]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await sleep(3500)
  // The citizen panel is reached by the rail tab on desktop and by the bottom
  // sheet bar on a phone. Click whichever exists in this layout.
  const clicked = await evaluate(`(() => {
    const rail = document.getElementById('tab-citizen');
    if (rail && rail.getBoundingClientRect().height > 0) { rail.click(); return 'rail-tab'; }
    const sheet = document.querySelector('#sheettabs button[data-sheet="citizen"]');
    if (sheet && sheet.getBoundingClientRect().height > 0) { sheet.click(); return 'sheet-tab'; }
    return 'not-found';
  })()`)
  console.log(`${w}x${h} clicked: ${clicked}`)
  await sleep(4000)
  // Pick a province the way a person does: click a chip in the picker.
  const picked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button, .chip, [role=button]')];
    const hit = btns.find(b => (b.innerText||'').includes('เชียงใหม่') && b.getBoundingClientRect().height > 0);
    if (hit) { hit.click(); return (hit.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40); }
    return 'not-found';
  })()`)
  console.log(`${w}x${h} province picked: ${picked}`)
  await sleep(9000)

  const report = await evaluate(`(() => {
    const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return {h: Math.round(b.height), w: Math.round(b.width), top: Math.round(b.top), left: Math.round(b.left), display: s.display}; };
    const wind = document.querySelector('.citizen-wind');
    const badge = document.querySelector('.wind-badge');
    const arrow = document.querySelector('.wind-badge .wind-arrow');
    const smoke = document.querySelector('.citizen-smoke');
    const out = {
      windBlock: box(wind),
      windText: wind ? wind.innerText.replace(/\\s+/g,' ').trim() : null,
      windTitle: badge ? badge.getAttribute('title') : null,
      arrowTransform: arrow ? getComputedStyle(arrow).transform : null,
      arrowBox: box(arrow),
      smokeBlock: box(smoke),
      smokeText: smoke ? smoke.innerText.replace(/\\s+/g,' ').trim().slice(0,160) : null,
      docH: document.documentElement.scrollHeight,
      viewportH: innerHeight,
    };
    return JSON.stringify(out, null, 1);
  })()`)
  console.log(report)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `/tmp/citizen-${w}.png`
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log(`→ ${file}\n`)
}
console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
