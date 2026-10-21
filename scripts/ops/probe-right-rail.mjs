// Focused probe: what is actually inside the right rail, and does it render?
import { spawn } from 'node:child_process'
const CHROME = '/private/tmp/pw-mavis/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const PORT = 9335
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/ad-probe2-profile', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1; const pending = new Map()
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: URL })
for (let i = 0; i < 120; i++) { await sleep(2000); if (await evaluate('!document.getElementById("boot")')) break }
await sleep(6000)
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await sleep(3000)

const PROBE = `(() => {
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return {h: Math.round(b.height), w: Math.round(b.width), top: Math.round(b.top), left: Math.round(b.left),
            display: s.display, overflow: s.overflowY, scrollH: el.scrollHeight, cls: String(el.className||'').slice(0,50), id: el.id}; };
  const rail = document.getElementById('rail-right');
  const out = { rail: box(rail) };
  out.railChildren = [...rail.children].map(box);
  const an = document.getElementById('analytics');
  out.analytics = box(an);
  out.analyticsChildCount = an ? an.children.length : -1;
  out.analyticsFirstChildren = an ? [...an.children].slice(0,6).map(box) : [];
  out.analyticsText = an ? an.innerText.replace(/\\s+/g,' ').slice(0,300) : '(no #analytics)';
  out.analyticsHTMLlen = an ? an.innerHTML.length : -1;
  // What is visibly painted in the rail region? Sample the pixel colours by
  // asking the DOM for elements intersecting the void.
  const voidBox = {x: 1200, y: 400};
  out.hitAtVoid = document.elementsFromPoint(voidBox.x, voidBox.y).slice(0,4).map(e => e.id + '.' + String(e.className||'').slice(0,30));
  out.railText = rail.innerText.replace(/\\s+/g,' ').slice(0,300);
  // The left rail, for comparison: how full is it?
  const left = document.getElementById('rail-left');
  out.leftRail = box(left);
  out.leftScrollH = left.scrollHeight; out.leftClientH = left.clientHeight;
  return JSON.stringify(out, null, 1);
})()`
console.log(await evaluate(PROBE))
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
