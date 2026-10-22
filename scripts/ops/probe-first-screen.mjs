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
import { join } from 'node:path'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9700 + (process.pid % 200)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const W = Number(process.argv[3] ?? 390)
const H = Number(process.argv[4] ?? 844)
const OUT = process.argv[5] ?? `/tmp/first-screen-${W}.png`
const LANG = process.argv[6] ?? ''
// The measurement the rail budget is checked against. Written by this
// probe from what the browser actually renders — never typed by hand —
// so the guard checks a live observation, not a constant someone
// remembered. See scripts/test-rail-width.mjs.
const FIT_JSON = join(import.meta.dirname, 'rank-fit.json')
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

  // Sample FIVE columns so a band that only has content in one column
  // (a side rail, a floating button) is still seen. Three columns missed
  // the desktop's right rail entirely — the ledger reported the whole
  // screen as "main" because the map happened to be under the samples.
  const FX = [0.06, 0.28, 0.5, 0.72, 0.94];

  // The reader's eye path: what text actually sits in this band.
  const textAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    let n = el;
    for (let d = 0; d < 4 && n; d++, n = n.parentElement) {
      const t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
      if (t && t.length < 160) return t.slice(0, 120);
    }
    return null;
  };

  const bands = [];
  for (let y = 0; y < H; y += 4) {
    // Probe every column, then let the DOMINANT region own the band.
    //
    // The first version of this loop took the FIRST non-void column and
    // stopped — which on a multi-column desktop means the left rail always
    // won and the map and the right rail were structurally invisible: a
    // 1440px screen could be reported as one single region. A band that
    // belongs to several columns at once (a header over all of them) must
    // name the one that owns most of it, and the others must still be
    // reported — so the band carries its full column mix.
    const hits = [];
    for (const fx of FX) {
      const x = Math.round(W * fx);
      const el = document.elementFromPoint(x, y);
      if (!el) { hits.push({ x, fx, label: 'VOID' }); continue; }
      hits.push({ x, fx, label: regionOf(el) });
    }
    const tally = new Map();
    for (const h of hits) tally.set(h.label, (tally.get(h.label) || 0) + 1);
    let label = 'VOID', best = 0;
    for (const [k, v] of tally) if (v > best) { best = v; label = k; }
    const mix = [...new Set(hits.map(h => h.label))];

    const last = bands[bands.length - 1];
    const same = last && last.label === label && last.mix.join('|') === mix.join('|');
    if (same) last.h += 4;
    else bands.push({ label, h: 4, top: y, mix, hits });
  }

  const ledger = bands.map(b => {
    // Read the text from the columns that belong to the dominant region,
    // not always the centre column — on the desktop the centre column is
    // the map, so the band was described by map labels instead of the
    // content the reader actually reads there.
    const cols = b.hits.filter(h => h.label === b.label);
    const seen = new Set();
    for (let y = b.top; y < b.top + b.h; y += 8) {
      for (const c of cols) {
        const t = textAt(c.x, y);
        if (t) { seen.add(t); break; }
      }
    }
    return { label: b.label, h: b.h, top: b.top, mix: b.mix, text: [...seen].slice(0, 3) };
  });

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

  // HOW MUCH THE RANKING TABLE IS CROPPED. The name column is the table's
  // widest content and the narrowest track; when the rail is sized for
  // prose instead of for the table, the longest province names are cut
  // off — and "กรุงเทพมหานคร" is the name every reader scans for.
  //
  // Measuring a grid item's scrollWidth tells you nothing about slack:
  // a block-level grid item reports its TRACK width, not its text width.
  // So the text is measured with the canvas, per node, with that node's
  // own font — the unit in a header is 8px while the label is 11px, and
  // measuring them as one string would invent a width that does not exist.
  const rankFit = (() => {
    const row = document.querySelector('.rank-row');
    const summary = row?.querySelector('.rank-summary');
    if (!row || !summary) return null;
    const rail = document.getElementById('rail-left');
    const canvas = document.createElement('canvas').getContext('2d');
    const fontOf = el => {
      const s = getComputedStyle(el);
      return s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
    };
    const textWidth = el => {
      let total = 0;
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          canvas.font = fontOf(el);
          total += canvas.measureText(node.textContent).width;
        } else if (node.nodeType === 1) {
          canvas.font = fontOf(node);
          total += canvas.measureText(node.textContent).width;
        }
      }
      return Math.ceil(total);
    };

    const tracks = getComputedStyle(summary).gridTemplateColumns.split(' ').map(parseFloat);
    const rows = [...document.querySelectorAll('.rank-row')];
    const cols = [];
    for (let i = 0; i < tracks.length; i++) {
      let need = 0, who = '';
      for (const r of rows) {
        // The grid cells live inside .rank-summary — .rank-row's own children
        // are the summary button and the (hidden) expand block, so indexing
        // .rank-row measures the whole row's text instead of one column.
        const cell = r.querySelector('.rank-summary')?.children[i];
        if (!cell) continue;
        const w = textWidth(cell);
        if (w > need) { need = w; who = (cell.textContent || '').trim().slice(0, 24); }
      }
      const head = document.querySelectorAll('.rank-columns > *')[i];
      const headNeed = head ? textWidth(head) : 0;
      const headText = head ? (head.textContent || '').trim().slice(0, 24) : '';
      cols.push({
        i, track: Math.round(tracks[i]), need, who,
        head: headText, headNeed,
        binding: Math.max(need, headNeed),
        // The name column is the flexible one. getComputedStyle resolves
        // 1fr to a pixel width, so the template cannot be read back from
        // it — the guard re-parses the CSS and asserts this assumption.
        flexible: i === 0,
      });
    }
    const sum = getComputedStyle(summary);
    const gap = parseFloat(sum.columnGap) || 0;
    const padL = parseFloat(sum.paddingLeft) || 0;
    const padR = parseFloat(sum.paddingRight) || 0;
    const fixed = cols.filter(c => !c.flexible).reduce((s, c) => s + c.track, 0);
    const name = cols[0];
    const rowBorder = parseFloat(getComputedStyle(row).borderLeftWidth) || 0;
    const scrollbar = rail ? Math.max(0, document.querySelector('#ranking').offsetWidth - document.querySelector('#ranking').clientWidth) : 0;
    const required = Math.ceil(name.binding + fixed + gap * (cols.length - 1) + padL + padR + rowBorder + scrollbar);

    // What the reader actually sees, for the columns that overflow.
    const cut = [];
    for (const r of rows) {
      const el = r.querySelector('.rank-name');
      if (!el) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        cut.push({ text: (el.textContent || '').trim(), need: el.scrollWidth, have: el.clientWidth });
      }
    }

    return {
      railW: rail ? Math.round(rail.getBoundingClientRect().width) : null,
      tracks: cols.map(c => c.track),
      gap, padL, padR, rowBorder, scrollbar, rows: rows.length,
      nameFont: (() => { const s = getComputedStyle(row.querySelector('.rank-name')); return s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily; })(),
      cols: cols.map(c => ({ ...c, flexible: undefined })),
      nameNeed: name.binding,
      required,
      cut: cut.slice(0, 10),
      cutCount: cut.length,
    };
  })();

  return JSON.stringify({
    viewport: { w: W, h: H },
    docH: document.documentElement.scrollHeight,
    ledger,
    fixed,
    clipped,
    note: noteBox,
    rankFit,
    firstDataRow: row ? { top: Math.round(rb.top), h: Math.round(rb.height), text: (row.innerText || '').replace(/\\s+/g, ' ').slice(0, 70) } : null,
    detail: {
      panelHead: breakdown('.panel-head'),
      ranking: breakdown('#ranking'),
      modeBlock: breakdown('.rank-mode-block'),
      card: breakdown('.rank-national-card'),
      railLeft: breakdown('#rail-left'),
      railRight: breakdown('#rail-right'),
      map: breakdown('#map'),
    },
  }, null, 1);
})()`

// MEASURE BOTH LANGUAGES. A language switch is not cosmetic: the province
// names change, and the English names are longer than the Thai ones. A
// column budget measured in Thai only proves the table fits in Thai — and
// it was the English names that were being cut, fifteen of them.
const clickLang = lang => evaluate(`(() => {
  const b = document.querySelector('#langtoggle button[data-lang="${lang}"]');
  if (!b) return 'no button';
  b.click();
  return 'clicked';
})()`)

const readLedger = async () => {
  const raw = await evaluate(LEDGER)
  if (raw?.__error) { console.error('probe failed:', raw.__error); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
  return JSON.parse(raw)
}

const thData = await readLedger()
console.log(`\nlanguage → en: ${await clickLang('en')}`)
await sleep(3000)
const enData = await readLedger()

// THE ARTIFACT the rail guard checks. Written from what the browser
// rendered, never typed by hand.
const fitOf = d => d.rankFit && ({
  rail: d.rankFit.railW,
  tracks: d.rankFit.tracks,
  gap: d.rankFit.gap, padL: d.rankFit.padL, padR: d.rankFit.padR,
  rowBorder: d.rankFit.rowBorder, scrollbar: d.rankFit.scrollbar, rows: d.rankFit.rows,
  nameFont: d.rankFit.nameFont,
  nameNeed: d.rankFit.nameNeed,
  cut: d.rankFit.cutCount,
  cutNames: d.rankFit.cut.map(c => c.text),
  measuredAt: new Date().toISOString(),
})
writeFileSync(FIT_JSON, JSON.stringify({
  note: 'Written by scripts/ops/probe-first-screen.mjs — a live browser measurement of the ranking table at 1440x900. The guard scripts/test-rail-width.mjs reads this; re-run the probe after changing the table CSS or the name font.',
  viewport: { w: W, h: H },
  th: fitOf(thData),
  en: fitOf(enData),
}, null, 2))
console.log(`\nwrote ${FIT_JSON}`)

// End in the requested language so the screenshot is the one asked for.
if ((LANG || 'th') !== 'en') {
  console.log(`language → ${LANG || 'th'}: ${await clickLang(LANG || 'th')}`)
  await sleep(2500)
}
const data = (LANG || 'th') === 'en' ? enData : thData

console.log(`\n=== FIRST-SCREEN LEDGER ${data.viewport.w}x${data.viewport.h} ===`)
let chrome = 0
for (const b of data.ledger) {
  const pct = Math.round((b.h / data.viewport.h) * 100)
  const label = b.label.padEnd(20)
  const mix = b.mix && b.mix.length > 1 ? '  [' + b.mix.join(' | ') + ']' : ''
  const text = (b.text || []).join(' | ').slice(0, 80)
  console.log(`${String(b.top).padStart(4)}–${String(b.top + b.h).padEnd(4)} ${String(b.h).padStart(4)}px ${String(pct).padStart(3)}%  ${label} ${text}${mix}`)
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
if (data.rankFit) {
  const f = data.rankFit
  console.log(`\nranking fit: rail ${f.railW}px  tracks [${f.tracks.join(' ')}]  gap ${f.gap}  pad ${f.padL}/${f.padR}`)
  for (const c of f.cols) {
    console.log(`   col ${c.i} track ${String(c.track).padStart(3)}px  needs ${String(c.binding).padStart(3)}px  hdr "${c.head}" ${c.headNeed}px  val "${c.who}" ${c.need}px`)
  }
  console.log(`   name column needs ${f.nameNeed}px → the rail must be ≥ ${f.required}px; it is ${f.railW}px`)
  console.log(`   ${f.cutCount} names cut:`)
  for (const c of f.cut) console.log(`      CUT  "${c.text}" needs ${c.need}px, has ${c.have}px`)
}

console.log(`\nclipped elements: ${(data.clipped || []).length ? '' : 'none'}`)
for (const c of data.clipped || []) console.log(`   ${c.cls.padEnd(30)} box ${c.h}px / client ${c.clientH}px / content ${c.scrollH}px  ${c.font}/${c.line}  "${c.text}"`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log(`shot: ${OUT}`)

ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(0)
