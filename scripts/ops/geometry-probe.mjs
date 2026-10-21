// A geometry probe for the dashboard — reports what the screenshots show,
// with numbers, so a fix is aimed at a cause and not at a picture.
//
// This is a dev instrument, not a product feature: it is not shipped, not
// imported by the app, and not part of any deploy.
import { spawn } from 'node:child_process'

const CHROME = '/private/tmp/pw-mavis/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const PORT = 9334
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/ad-probe-profile', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })

let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page')
  } catch {}
}
if (!target) { console.error('no target'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1
const pending = new Map()
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? '') }
  return r.result?.value
}

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: URL })
for (let i = 0; i < 120; i++) {
  await sleep(2000)
  if (await evaluate('!document.getElementById("boot")')) break
}
await sleep(5000)

const PROBE = `(() => {
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return {top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width),
            left: Math.round(b.left), overflowY: s.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight,
            cls: el.className && String(el.className).slice(0,60)}; };
  const out = { viewport: {w: innerWidth, h: innerHeight}, docH: document.documentElement.scrollHeight };

  // Every element that visibly holds the right-hand column region.
  out.rightColumn = [...document.querySelectorAll('body > *, #app > *')]
    .map(box).filter(b => b && b.left > innerWidth * 0.6 && b.h > 40);
  out.topLevel = [...document.querySelectorAll('body > *, #app > *')].map(box);

  // The ranking list: where is it, is it in the flow, is it scrolled out?
  const rank = document.querySelector('#left-eyebrow')?.closest('section, aside, div');
  out.ranking = box(rank);
  out.rankingRows = [...document.querySelectorAll('.rank-row, .rank-item, [data-rank], .ranking li, .ranking-row')].slice(0,4).map(box);
  out.rankingText = (document.querySelector('#left-eyebrow')?.closest('section, aside, div')?.innerText ?? '').replace(/\\s+/g,' ').slice(0,200);

  // Which tabs are actually visible, and how tall is the tab strip?
  out.tabStrip = box(document.querySelector('#tab-analizen')?.parentElement ?? document.querySelector('[id^=tab-]')?.parentElement);
  out.visibleTabs = [...document.querySelectorAll('[id^=tab-]')].filter(t => t.getBoundingClientRect().height > 0).map(t => ({id: t.id, t: Math.round(t.getBoundingClientRect().top), w: Math.round(t.getBoundingClientRect().width)}));

  // The bottom bar and the last row of the main table: do they collide?
  const bar = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e);
      return (s.position === 'fixed' || s.position === 'sticky') && e.getBoundingClientRect().bottom > innerHeight - 120 && e.getBoundingClientRect().height > 20; })
      .map(box);
  out.fixedBars = bar;
  const rows = [...document.querySelectorAll('table tr, .place-row, [data-province]')].filter(r => r.getBoundingClientRect().height > 4);
  out.lastRows = rows.slice(-3).map(box);
  out.rowCount = rows.length;
  return JSON.stringify(out, null, 1);
})()`

for (const [w, h] of [[1440, 900], [1024, 768]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await sleep(3000)
  console.log(`\n================ ${w}x${h} ================`)
  console.log(await evaluate(PROBE))
}

ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
