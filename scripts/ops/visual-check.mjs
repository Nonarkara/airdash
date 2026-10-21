// A minimal Chrome DevTools Protocol driver — zero dependencies.
//
// WHY THIS EXISTS
// `--screenshot` waits for the load event, and the dashboard on this host does
// not reach it in any reasonable time: the box carries a dozen concurrent
// agent sessions, the browser renderer is CPU-starved, and a single 45 KB
// module took 11 s in the browser against 6 ms from curl. The page is not
// broken — it is crawling. Waiting for `load` therefore proves nothing, and
// the standard screenshot flag simply times out.
//
// This driver instead:
//   1. opens a page and listens for console messages and uncaught exceptions,
//      so a client-side failure is visible instead of silent;
//   2. polls for a readiness signal (the boot element removed) with a ceiling;
//   3. captures the viewport at the three widths the design law requires.
//
// Node 22 has a global WebSocket, so this needs nothing installed.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'

const CHROME = requireChrome()
const PORT = 9400 + (process.pid % 400)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const OUT = process.argv[3] ?? '/tmp/ad'
const WIDTHS = [[1440, 900], [1024, 768], [390, 844]]
const READY = '!document.getElementById("boot")'
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS ?? 240000)

const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--disable-dev-shm-usage', '--disable-background-timer-throttling',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=/tmp/ad-cdp-${process.pid}`,
  'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { try { child.kill('SIGKILL') } catch {} }
process.on('exit', cleanup)

// Wait for the debugging endpoint.
let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page')
  } catch {}
}
if (!target) { console.error('FATAL: no Chrome debug target'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let nextId = 1
const pending = new Map()
const logs = []
const exceptions = []

ws.onmessage = ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? []).map(a => a.value ?? a.description ?? a.type).join(' ')
    logs.push({ level: msg.params.type, text })
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    exceptions.push(`${d.text} ${d.exception?.description ?? ''} @ ${d.url ?? ''}:${d.lineNumber ?? '?'}`)
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    if (e.level === 'error') logs.push({ level: 'error', text: `[${e.source}] ${e.text} ${e.url ?? ''}` })
  }
}

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})

const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  return r.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Network.enable')

const t0 = Date.now()
await send('Page.navigate', { url: URL })
// A screenshot of the wrong page is worse than no screenshot: it looks like
// evidence. Assert the page we were sent to is the page we asked for, before
// believing anything it renders.
await sleep(2500)
const landed = await evaluate('JSON.stringify({href: location.href, title: document.title})')
let landedOk = false
try {
  const l = JSON.parse(landed)
  landedOk = l.href.startsWith(URL.split('#')[0].slice(0, 40)) && /AIRDASH|AIR STORY/i.test(l.title)
  console.log(`landed: ${l.href} — ${l.title}`)
} catch {}
if (!landedOk) {
  console.error(`FATAL: the browser landed on the wrong page, not ${URL}. Refusing to photograph it.`)
  ws.close(); cleanup(); process.exit(1)
}

// Wait for the boot element to go away. The boot splash is removed by
// main.js when the snapshot is applied; if it never goes, the page did not
// boot and every screenshot would be of the splash.
let booted = false
while (Date.now() - t0 < READY_TIMEOUT_MS) {
  await sleep(2000)
  try {
    if (await evaluate(READY)) { booted = true; break }
  } catch {}
}
const bootMs = Date.now() - t0

if (!booted) {
  console.log(`NOT BOOTED after ${Math.round(bootMs / 1000)}s — the boot element is still present`)
} else {
  console.log(`booted in ${Math.round(bootMs / 1000)}s`)
}

// Let the map tiles, the situation panels and the wind field settle. The
// panels render from their own API fetches, so a short wait photographs an
// empty column that is not empty — that misreading nearly sent a layout
// refactor after a screenshot artefact.
await sleep(12000)

for (const [w, h] of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: w < 500,
  })
  await sleep(6000)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `${OUT}-${w}.png`
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  // Measure the chrome cost and the first-screen composition from the DOM.
  const geom = await evaluate(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {h: Math.round(b.height), w: Math.round(b.width), top: Math.round(b.top)} };
    const vis = el => { if (!el) return false; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.height > 0 && b.width > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01 };
    const head = document.querySelector('header, .topbar, #topbar, .app-header');
    const windBadge = document.querySelector('.wind-badge');
    const cards = [...document.querySelectorAll('.places-card')];
    return JSON.stringify({
      viewport: {w: innerWidth, h: innerHeight},
      header: r(head),
      headerVisible: vis(head),
      scrollY: scrollY,
      docHeight: document.documentElement.scrollHeight,
      windBadge: windBadge ? windBadge.innerText.replace(/\\s+/g,' ').trim().slice(0,120) : null,
      windArrows: document.querySelectorAll('.haze-wind-icon').length,
      placesCards: cards.length,
      firstCardTop: cards[0] ? Math.round(cards[0].getBoundingClientRect().top) : null,
      tabs: [...document.querySelectorAll('[id^=tab-]')].map(t => ({id: t.id, t: Math.round(t.getBoundingClientRect().top), w: Math.round(t.getBoundingClientRect().width)})),
    });
  })()`)
  console.log(`${w}x${h} -> ${file}\n  ${geom}`)
}

console.log('\n--- console errors ---')
const errs = logs.filter(l => l.level === 'error' || l.level === 'warning')
console.log(errs.length ? errs.map(e => `${e.level}: ${e.text}`).join('\n') : '(none)')
console.log('--- uncaught exceptions ---')
console.log(exceptions.length ? exceptions.join('\n') : '(none)')

ws.close()
cleanup()
process.exit(0)
