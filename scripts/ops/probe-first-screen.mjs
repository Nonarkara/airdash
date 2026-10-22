// FIRST-SCREEN LEDGER — what owns each band of the opening screen.
//
// WHY THIS PROBE
// MSH asks one question of every region: why is this here, why this size,
// why this far from that. Answering it for a whole screen needs a ledger:
// the phone's first 844px, banded by the region that actually occupies it,
// so a reader can see how much of the opening screen is chrome and how much
// is the task.
//
// The method is point sampling, not CSS archaeology: for every 4px row the
// probe asks the browser what is painted there (elementFromPoint), walks up
// to the nearest landmark ancestor, and labels the band with it. That
// captures what a reader sees — including fixed and sticky chrome, which
// sits outside the document flow and therefore never shows up in a
// scrollHeight calculation.
//
// A band with no content at all is reported as a VOID: unexplained space is
// not the same as whitespace, and the difference is invisible in a
// screenshot until you know to look for it.
//
// This is a dev instrument, not a product feature: it is not shipped, not
// imported by the app, and not part of any deploy.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const W = Number(process.argv[3] ?? 390)
const H = Number(process.argv[4] ?? 844)
const OUT = process.argv[5] ?? `/tmp/first-screen-${W}.png`
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-firstscreen-${PORT}`, 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 })
await send('Page.navigate', { url: URL })
const ready = await waitForLiveData(evaluate, sleep)
if (!ready.ok) {
  console.error(`FATAL: ${ready.reason} after ${Math.round(ready.waited_ms / 1000)}s — refusing to measure a page that is not live.`)
  ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1)
}
console.log(`live in ${Math.round(ready.waited_ms / 1000)}s at ${W}x${H}`)
await sleep(9000)

const LEDGER = `(() => {
  const H = innerHeight, W = innerWidth;

  // The region a painted pixel belongs to: the nearest landmark ancestor.
  // Landmarks are the structural parts a reader thinks in, not every div.
  const LANDMARKS = [
    'header', '.hd-data', '#national', '#danger-hero', '.danger', '.brand',
    '.header-actions', '#header-menu', '#place-search-container', '#focusbox',
    '.tabs', '.rail', '#rail-left', '#rail-right', 'main', '#map', '#mapwrap',
    '.sheet', '.bottombar', '.footer', '.legend', '.panel-head', '.rank-list',
    '#left-eyebrow', '.citizen-panel', '#analytics', '.modal', '.drawer',
  ];
  const regionOf = el => {
    let n = el;
    while (n && n !== document.body) {
      for (const sel of LANDMARKS) {
        try { if (n.matches(sel)) return sel; } catch {}
      }
      n = n.parentElement;
    }
    return n === document.body ? 'body' : 'unclassified';
  };

  const bands = [];
  for (let y = 0; y < H; y += 4) {
    let label = 'VOID';
    // Sample three columns so a band that only has content at one edge
    // (a side rail, a floating button) is still seen.
    for (const x of [Math.round(W * 0.5), Math.round(W * 0.08), Math.round(W * 0.92)]) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const label2 = regionOf(el);
      if (label2 !== 'VOID') { label = label2; break; }
    }
    const last = bands[bands.length - 1];
    if (last && last.label === label) last.h += 4;
    else bands.push({ label, h: 4, top: y });
  }

  // What text actually sits in each band — the reader's eye path.
  const textIn = (top, h) => {
    const seen = new Set();
    for (let y = top; y < top + h; y += 8) {
      const el = document.elementFromPoint(Math.round(W * 0.5), y);
      if (!el) continue;
      let n = el;
      for (let d = 0; d < 4 && n; d++, n = n.parentElement) {
        const t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
        if (t && t.length < 160) { seen.add(t.slice(0, 120)); break; }
      }
    }
    return [...seen].slice(0, 3);
  };

  const ledger = bands.map(b => ({ ...b, text: textIn(b.top, b.h) }));

  // Fixed/sticky chrome: outside the flow, invisible to scrollHeight.
  const fixed = [...document.querySelectorAll('body *')].filter(e => {
    const s = getComputedStyle(e);
    return (s.position === 'fixed' || s.position === 'sticky') && e.getBoundingClientRect().height > 8;
  }).map(e => {
    const b = e.getBoundingClientRect();
    return { cls: String(e.className || e.id || e.tagName).slice(0, 44), top: Math.round(b.top), h: Math.round(b.height) };
  });

  // The first row of the worst-air ranking — the task's first data.
  const row = document.querySelector('.rank-row, .rank-item, [data-rank], .ranking li, .ranking-row, .place-row');
  const rb = row?.getBoundingClientRect();

  // The breakdown behind a band: what its blocks actually are, and how
  // much each one costs. A region name tells you WHERE the space went;
  // this tells you what to cut.
  const breakdown = root => {
    const r = document.querySelector(root);
    if (!r) return null;
    const rb2 = r.getBoundingClientRect();
    return {
      box: { top: Math.round(rb2.top), h: Math.round(rb2.height) },
      children: [...r.children].map(c => {
        const b = c.getBoundingClientRect();
        return {
          cls: String(c.className || c.id || c.tagName).slice(0, 40),
          tag: c.tagName.toLowerCase(),
          top: Math.round(b.top), h: Math.round(b.height),
          text: (c.innerText || c.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
        };
      }).filter(c => c.h > 0),
    };
  };

  // CLIPPING CENSUS — content that does not fit the box it was given.
  // The mandated score disclaimer must ship in full; if its box is too
  // short, the tail of the sentence is silently cut and the law is broken
  // in a way no screenshot of the top of the page would show.
  const clipped = [...document.querySelectorAll('body *')].filter(e => {
    const s = getComputedStyle(e);
    if (!/hidden|clip/.test(s.overflowY) && !/hidden|clip/.test(s.overflowX)) return false;
    if (s.overflowY === 'visible' && s.overflowX === 'visible') return false;
    return e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2;
  }).map(e => {
    const b = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return {
      cls: String(e.className || e.id || e.tagName).slice(0, 40),
      h: Math.round(b.height), clientH: e.clientHeight, scrollH: e.scrollHeight,
      font: s.fontSize, line: s.lineHeight,
      text: (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
    };
  }).slice(0, 12);

  // The mandated disclaimer, measured: does the whole sentence fit?
  const note = document.getElementById('risk-method-note');
  const noteBox = note ? {
    h: Math.round(note.getBoundingClientRect().height),
    clientH: note.clientHeight, scrollH: note.scrollHeight,
    font: getComputedStyle(note).fontSize, line: getComputedStyle(note).lineHeight,
    lines: Math.round(note.scrollHeight / parseFloat(getComputedStyle(note).lineHeight || 1)),
    text: (note.innerText || '').replace(/\\s+/g, ' ').trim(),
  } : null;

  return JSON.stringify({
    viewport: { w: W, h: H },
    docH: document.documentElement.scrollHeight,
    ledger,
    fixed,
    clipped,
    note: noteBox,
    firstDataRow: row ? { top: Math.round(rb.top), h: Math.round(rb.height), text: (row.innerText || '').replace(/\\s+/g, ' ').slice(0, 70) } : null,
    detail: {
      panelHead: breakdown('.panel-head'),
      ranking: breakdown('#ranking'),
      modeBlock: breakdown('.rank-mode-block'),
      card: breakdown('.rank-national-card'),
    },
  }, null, 1);
})()`

const raw = await evaluate(LEDGER)
if (raw?.__error) { console.error('probe failed:', raw.__error); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
const data = JSON.parse(raw)

console.log(`\n=== FIRST-SCREEN LEDGER ${data.viewport.w}x${data.viewport.h} ===`)
let chrome = 0
for (const b of data.ledger) {
  const pct = Math.round((b.h / data.viewport.h) * 100)
  const label = b.label.padEnd(24)
  const text = (b.text || []).join(' | ').slice(0, 90)
  console.log(`${String(b.top).padStart(4)}–${String(b.top + b.h).padEnd(4)} ${String(b.h).padStart(4)}px ${String(pct).padStart(3)}%  ${label} ${text}`)
  if (b.label === 'VOID') chrome += b.h
}
const voidPx = data.ledger.filter(b => b.label === 'VOID').reduce((s, b) => s + b.h, 0)
console.log(`\nVOID (unexplained): ${voidPx}px = ${Math.round((voidPx / data.viewport.h) * 100)}% of the first screen`)
console.log(`first data row: ${data.firstDataRow ? `top ${data.firstDataRow.top}px (${Math.round((data.firstDataRow.top / data.viewport.h) * 100)}% down) — "${data.firstDataRow.text}"` : 'NONE FOUND'}`)
console.log(`fixed/sticky chrome: ${data.fixed.length ? data.fixed.map(f => `${f.cls}@${f.top}+${f.h}`).join(', ') : 'none'}`)

for (const [name, d] of Object.entries(data.detail || {})) {
  if (!d) { console.log(`\n${name}: absent`); continue }
  console.log(`\n${name} (top ${d.box.top}, ${d.box.h}px):`)
  for (const c of d.children) console.log(`   ${String(c.h).padStart(4)}px  ${c.tag}.${c.cls.padEnd(22)} ${c.text}`)
}

if (data.note) {
  console.log(`\ndisclaimer (#risk-method-note): ${data.note.h}px box, ${data.note.scrollH}px content, ${data.note.lines} lines @ ${data.note.font}/${data.note.line}`)
  console.log(`   "${data.note.text}"`)
  if (data.note.scrollH > data.note.clientH + 2) console.log(`   *** CLIPPED — ${data.note.scrollH - data.note.clientH}px of the mandated sentence is cut off ***`)
}
console.log(`\nclipped elements: ${(data.clipped || []).length ? '' : 'none'}`)
for (const c of data.clipped || []) console.log(`   ${c.cls.padEnd(30)} box ${c.h}px / content ${c.scrollH}px  ${c.font}/${c.line}  "${c.text}"`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log(`shot: ${OUT}`)

ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
