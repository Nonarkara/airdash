// Live check: does the haze preparation panel show the PROVINCE's own
// measured particle size — and exactly one particle-size answer?
//
// The panel is per-province (there is a province dropdown at the top of it),
// but its particle-size strip used to be the Ångström exponent: a national
// optical signal from five AERONET instruments, whose own caption said it
// was "not a per-province measurement". Air4Thai publishes PM10 as well as
// PM2.5, so the coarse fraction of PM10 is a direct measurement at a ground
// station — and it IS per province.
//
// The rule this checks is "one question, one answer": where the province has
// a measured size, that is the strip; where it does not, the optical signal
// stands in and says what it is. Never both.
//
// Usage: node scripts/ops/check-haze-strip.mjs [url]
import { spawn } from 'node:child_process'
import { requireChrome } from './chrome.mjs'
import { waitForLiveData } from './page.mjs'

const CHROME = requireChrome()
const PORT = 9850 + (process.pid % 120)
const URL = process.argv[2] ?? 'http://localhost:28341/ops.html'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Which provinces have a measured size, and which do not? From the same
// payload the panel reads.
const science = await (await fetch(URL.replace(/\/ops\.html.*$/, '/api/science'))).json()
const withSize = (science.provinces ?? []).find(p => p.particle)
const withoutSize = (science.provinces ?? []).find(p => !p.particle)
if (!withSize || !withoutSize) { console.error('FATAL: need one province with and one without a measured size'); process.exit(1) }
console.log(`with a measured size:    ${withSize.code} ${withSize.name_th}`)
console.log(`without a measured size: ${withoutSize.code} ${withoutSize.name_th}`)

const child = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-hazestrip-${PORT}`, 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: URL })
const ready = await waitForLiveData(evaluate, sleep)
if (!ready.ok) { console.error(`FATAL: ${ready.reason}`); ws.close(); try { child.kill('SIGKILL') } catch {}; process.exit(1) }
console.log(`live in ${Math.round(ready.waited_ms / 1000)}s`)

const READ = `(() => {
  const strip = document.querySelector('.haze-plan-aerosol')
  const sel = document.querySelector('[data-plan-province]')
  return JSON.stringify({
    province: sel?.value ?? null,
    hasStrip: !!strip,
    source: strip?.getAttribute('data-source') ?? null,
    state: strip?.getAttribute('data-state') ?? null,
    text: (strip?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1400),
  })
})()`

// The strip is filled after the panel paints, and it may be waiting on a
// fetch — give it room.
const waitStrip = async (want, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const raw = await evaluate(READ)
    const d = JSON.parse(raw)
    if (d.hasStrip && (!want || d.source === want)) return d
    await sleep(500)
  }
  return JSON.parse(await evaluate(READ))
}

const pick = async code => {
  // The panel paints asynchronously; picking before the select exists is a
  // no-op that would silently read the DEFAULT province and pass for the
  // wrong reason. Wait for the control.
  for (let i = 0; i < 60; i++) {
    const ok = await evaluate(`!!document.querySelector('[data-plan-province]')`)
    if (ok) break
    await sleep(500)
  }
  return evaluate(`(() => {
    const sel = document.querySelector('[data-plan-province]')
    if (!sel) return 'no select'
    sel.value = ${JSON.stringify(code)}
    sel.dispatchEvent(new Event('change'))
    return 'picked ' + sel.value
  })()`)
}

// A picture of the strip itself, not of the page: the strip sits below the
// fold of a 900px screen, so a viewport screenshot would never show it.
const { writeFileSync } = await import('node:fs')
const shootStrip = async file => {
  const rect = await evaluate(`(() => {
    const el = document.querySelector('.haze-plan-aerosol')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const b = el.getBoundingClientRect()
    return JSON.stringify({ x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 })
  })()`)
  if (!rect) { console.log(`no strip on screen for ${file}`); return }
  await sleep(700)
  const box = JSON.parse(rect)
  const el = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 2 } })
  writeFileSync(file, Buffer.from(el.data, 'base64'))
  console.log(`shot: ${file}`)
}

let failures = 0
const check = (name, cond, why = '') => {
  cond ? console.log(`PASS ${name}`) : (failures++, console.log(`FAIL ${name}${cond ? '' : ` — ${why}`}`))
}

// ── a province that HAS a measured size ───────────────────────────────────
console.log(`\n→ ${await pick(withSize.code)}`)
const measured = await waitStrip('measured')
console.log(`   province ${measured.province}, source ${measured.source}, state ${measured.state}`)
console.log(`   "${measured.text}"`)
check('the province with a measurement shows the MEASURED strip', measured.source === 'measured')
// Assert the VALUES, not the prose: the page may be in Thai or English and
// the sentence around them changes, but the numbers do not. An earlier
// version of this check matched an English phrase and failed on a Thai page
// for no reason other than the language.
const pa = withSize.particle
check('the measured strip names the station it was measured at', measured.text.includes(pa.station), measured.text.slice(0, 200))
check('the measured strip publishes the coarse fraction', measured.text.includes(`${Math.round(pa.coarse_fraction * 100)}%`), measured.text.slice(0, 200))
check('the measured strip shows the PM10 it was measured from', measured.text.includes(String(pa.pm10)), measured.text.slice(0, 200))
check('the measured strip does not carry the optical alpha', !/α/.test(measured.text), measured.text)
await shootStrip('/tmp/haze-strip-measured.png')

// ── a province that has none ───────────────────────────────────────────────
console.log(`\n→ ${await pick(withoutSize.code)}`)
const fallback = await waitStrip('optical')
console.log(`   province ${fallback.province}, source ${fallback.source}, state ${fallback.state}`)
console.log(`   "${fallback.text}"`)
check('the province without a measurement falls back to the optical strip',
  fallback.source === null || fallback.source === 'optical', `source ${fallback.source}`)
check('the fallback says it is a national signal, not per-province',
  /national-scale signal|ระดับประเทศ/.test(fallback.text), fallback.text.slice(0, 400))
check('the fallback still has a strip at all', fallback.hasStrip)

check('exactly one strip is on screen', await evaluate(`document.querySelectorAll('.haze-plan-aerosol').length`) === 1)
check('the strip belongs to the province that was picked', measured.province === withSize.code, `strip says ${measured.province}, picked ${withSize.code}`)

await shootStrip('/tmp/haze-strip-fallback.png')
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/tmp/haze-strip.png', Buffer.from(shot.data, 'base64'))
console.log('\nshot: /tmp/haze-strip.png')

console.log(`\n${failures} failed`)
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(failures ? 1 : 0)
