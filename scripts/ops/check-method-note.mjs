// Live check: does the mandated score disclaimer survive a language switch?
//
// #risk-method-note has had TWO writers for months:
//   header.js  → snap.risk.method_th / method_en  (the standing disclaimer
//                 the corpus bible requires to ship with the score)
//   ranking.js → "sorted by highest PM2.5 first"   (the ranking-mode note)
//
// initHeader() registers its 'lang' listener BEFORE initRanking() does, so
// on a language switch the ranking's writer runs last and wins. The
// mandated sentence then disappears from the screen until the next snapshot
// (up to 5 minutes). This script reproduces that live and prints what the
// element actually said before and after.
//
// Usage: node scripts/ops/check-method-note.mjs
import { spawn } from 'node:child_process'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9800 + (process.pid % 150)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-methodnote-${PORT}`, 'about:blank',
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
const ready = await waitForLiveData(evaluate, sleep)
if (!ready.ok) { console.error(`FATAL: ${ready.reason}`); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
await sleep(6000)

const NOTE = `(() => { const n = document.getElementById('risk-method-note');
  return JSON.stringify({ text: (n?.textContent || '').replace(/\\s+/g,' ').trim(), visible: !!n && n.getBoundingClientRect().height > 0 }) })()`

// The mandated sentence, in the language it must appear in. The Thai half
// is the corpus bible's sentence; the English half is the one the server
// publishes.
const CARRIES = {
  th: /ไม่ใช่การพยากรณ์/,
  en: /not a forecast/i,
}

const read = async () => JSON.parse(await evaluate(NOTE))
const clickLang = async lang => {
  await evaluate(`(() => { const b = document.querySelector('#langtoggle button[data-lang="${lang}"]'); if (b) b.click(); return !!b })()`)
  await sleep(2500)
}

const before = await read()
console.log(`BEFORE switch (th): ${before.text}`)
console.log(`  → ${CARRIES.th.test(before.text) ? 'CARRIES the mandated disclaimer' : '*** the mandated disclaimer is MISSING ***'}`)

// Switch to English. Clicking the button by its own data-lang matters: a
// selector that matched either button picked the Thai one (it comes first
// in the DOM) and so never switched language at all — which made the
// previous run of this script prove less than it looked like it did.
const clicked = await evaluate(`(() => { const b = document.querySelector('#langtoggle button[data-lang="en"]'); if (b) { b.click(); return 'clicked' } return 'no button' })()`)
await sleep(2500)
const after = await read()
console.log(`AFTER  switch (en): ${after.text}`)
console.log(`  → ${CARRIES.en.test(after.text) ? 'CARRIES the mandated disclaimer' : '*** the mandated disclaimer is MISSING ***'}`)

// And back to Thai, because a switch in each direction must hold.
await clickLang('th')
const back = await read()
console.log(`BACK   switch (th): ${back.text}`)
console.log(`  → ${CARRIES.th.test(back.text) ? 'CARRIES the mandated disclaimer' : '*** the mandated disclaimer is MISSING ***'}`)

const ok = CARRIES.th.test(before.text) && CARRIES.en.test(after.text) && CARRIES.th.test(back.text)
console.log(`\n${ok ? 'PASS — the mandated sentence survives every language switch' : 'FAIL — the mandated sentence does not ship with the score'}`)

ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(ok ? 0 : 1)
