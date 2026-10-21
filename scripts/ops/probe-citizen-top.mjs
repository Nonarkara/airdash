// Measure the top of the citizen panel: what is the first thing on the first
// screen, does anything overlap, and is the same name stated twice?
import { spawn } from 'node:child_process'
import { requireChrome } from './chrome.mjs'
const CHROME = requireChrome()
const PORT = 9600 + (process.pid % 200)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-cp-${process.pid}`, 'about:blank'], { stdio: 'ignore' })
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: 'http://localhost:28341/ops.html' })
await sleep(3500)
for (let i = 0; i < 120; i++) { await sleep(2000); if (await evaluate('!document.getElementById("boot")')) break }
await sleep(9000)
await evaluate(`(() => { const s = document.querySelector('#sheettabs button[data-sheet="citizen"]'); if (s) s.click(); return 'ok'; })()`)
await sleep(4000)
await evaluate(`(() => { const btns=[...document.querySelectorAll('button,.chip,[role=button]')]; const hit=btns.find(b=>(b.innerText||'').includes('เชียงใหม่')&&b.getBoundingClientRect().height>0); if(hit) hit.click(); return 'ok'; })()`)
await sleep(9000)

const PROBE = `(() => {
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return {tag: el.tagName, cls: String(el.className||'').slice(0,44), t: Math.round(b.top), l: Math.round(b.left),
            w: Math.round(b.width), h: Math.round(b.height), pos: s.position, fs: s.fontSize,
            txt: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,70)}; };
  const c = document.getElementById('citizen');
  const out = { viewport: innerHeight, panel: box(c) };
  out.topChildren = [...c.children].slice(0,7).map(box);
  // Anything painted in the first 200px, in DOM order.
  out.firstScreen = [...c.querySelectorAll('*')].filter(e => {
      const b = e.getBoundingClientRect();
      return b.height > 0 && b.top < 200 && b.top >= 0 && e.children.length === 0; })
    .map(box).slice(0,14);
  // How many times is the province name stated before the wind block?
  const wind = document.querySelector('.citizen-wind');
  const before = [...c.querySelectorAll('*')].filter(e => {
      const b = e.getBoundingClientRect();
      return e.children.length === 0 && b.height > 0 && b.top >= 0 && (wind ? b.bottom <= wind.getBoundingClientRect().top : b.top < 200); });
  out.nameMentionsBeforeWind = before.filter(e => (e.innerText||'').includes('เชียงใหม่')).map(box);
  // The wind block's own line budget.
  const note = document.querySelector('.citizen-wind-note');
  out.windNote = box(note);
  out.windNoteLines = note ? Math.round(note.getBoundingClientRect().height / parseFloat(getComputedStyle(note).lineHeight)) : null;
  const meta = document.querySelector('.wind-badge-meta');
  out.windMeta = box(meta);
  return JSON.stringify(out, null, 1);
})()`
console.log(await evaluate(PROBE))
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
