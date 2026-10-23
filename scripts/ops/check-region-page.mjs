// Live check: the regional page's wind workspace.
//
// The first-screen probe could not measure this page at all: region.html
// has no #boot splash and no .rank-row, so the shared readiness check saw
// no data and reported "never showed live data" for 300 seconds. This
// driver asks the page's own questions.
//
// What it holds:
//   - the map starts where the page says it does (104px: a 52px header and
//     a 52px toolbar), instead of a stack of bands above it;
//   - a location produces +1/+3/+6-hour air-movement marks;
//   - the limitation is VISIBLE next to the path, not buried in a drawer;
//   - a focused path survives a real viewport change;
//   - the page does not deny computing paths while shipping them.
//
// Usage: node scripts/ops/check-region-page.mjs [url]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireChrome } from './chrome.mjs'

const CHROME = requireChrome()
const PORT = 9880 + (process.pid % 100)
const URL = process.argv[2] ?? 'https://air.nonarkara.org/region'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const child = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ad-reg-${PORT}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page') } catch {}
}
if (!target) { console.error('no target'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1; const pending = new Map()
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.text }; return r.result?.value }

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: URL })

const READ = `JSON.stringify({
  status: (document.getElementById('status')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,140),
  mapTop: (() => { const m=document.getElementById('regional-map'); return m ? Math.round(m.getBoundingClientRect().top) : null })(),
  mapH: (() => { const m=document.getElementById('regional-map'); return m ? Math.round(m.getBoundingClientRect().height) : null })(),
  toolbarH: (() => { const m=document.querySelector('.region-map-toolbar'); return m ? Math.round(m.getBoundingClientRect().height) : null })(),
  headerH: (() => { const m=document.querySelector('header'); return m ? Math.round(m.getBoundingClientRect().height) : null })(),
  hourMarks: [...document.querySelectorAll('.wind-hour-mark span')].map(e=>e.textContent.trim()),
  // Every hour the chips NAME, not the number of chips. One chip may carry
  // three hours ("+1h·+3h·+6h") when they cannot be read apart — what must
  // never happen is an hour quietly missing.
  hourHours: [...new Set([...document.querySelectorAll('.wind-hour-mark span')].flatMap(e=>[...e.textContent.matchAll(/(\\d+)h/g)].map(m=>Number(m[1]))))].sort((a,b)=>a-b),
  // The rendered boxes, so the separation can be measured on screen rather
  // than inferred from the zoom.
  markBoxes: [...document.querySelectorAll('.wind-hour-mark')].map(e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),w:Math.round(b.width)}}),
  mapZoom: window.__regionMap ? window.__regionMap.getZoom() : null,
  steps: [...document.querySelectorAll('#wind-steps li')].map(e=>e.textContent.replace(/\\s+/g,' ').trim().slice(0,60)),
  summary: (document.getElementById('wind-path-summary')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,180),
  limit: (document.querySelector('.scenario-limit')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,220),
  limitVisible: (() => { const el=document.querySelector('.scenario-limit'); if(!el) return false; const b=el.getBoundingClientRect(); return b.width>0 && b.height>0 })(),
  // The map key is the ON-MAP caveat: the path is drawn on the map, so the
  // map itself has to say what it is. The long form lives in the wind
  // panel; this is what a reader sees without opening anything.
  mapKey: (document.querySelector('.wind-map-key')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,220),
  mapKeyVisible: (() => { const el=document.querySelector('.wind-map-key'); if(!el) return false; const b=el.getBoundingClientRect(); return b.width>0 && b.height>0 })(),
  windReading: (document.getElementById('wind-reading')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,80),
  // textContent, not innerText: innerText omits the collapsed directory,
  // which is exactly where a stale denial would hide. A check that cannot
  // see the text it is checking is a check that cannot fail.
  denied: /does not calculate transport paths|ไม่มีเส้นทางหรือเวลาถึงที่คำนวณ/.test(document.body.textContent || ''),
})`

let last = null
for (let i = 0; i < 90; i++) {
  await sleep(2000)
  const raw = await evaluate(READ)
  if (raw?.__error) continue
  last = JSON.parse(raw)
  if (last.hourMarks.length >= 3 || (last.steps && last.steps.length >= 3)) break
}
console.log('--- initial state ---')
console.log(JSON.stringify(last, null, 1))

let failures = 0
const check = (name, cond, why = '') => { cond ? console.log(`PASS ${name}`) : (failures++, console.log(`FAIL ${name} — ${why}`)) }
const skip = name => console.log(`NOT VERIFIED ${name}`)
// The closest pair of rendered chips, in screen pixels.
const minGap = boxes => {
  const b = boxes || []
  let gap = Infinity
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    gap = Math.min(gap, Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y))
  }
  return gap
}

// The hourly wind feed comes from Open-Meteo and is not always there. The
// page's own behaviour in that case is to REFUSE to draw a path — which is
// correct — so the path feature simply cannot be exercised. That is not a
// pass and it is not a failure: it is unverified, and it must be reported
// as such rather than dressed up either way.
const noWind = /No path drawn with missing or stale winds|Wind unavailable|ไม่มีลมรายชั่วโมง/.test(`${last?.summary || ''} ${last?.windReading || ''}`)

check('the regional page loaded its evidence', !!last && !/กำลังโหลด|Loading evidence/.test(last.status || ''), `status: ${last?.status}`)
check('the map starts below a header and a toolbar, not a stack of bands',
  last?.mapTop != null && last.mapTop <= 120 && last.mapTop >= 90,
  `map top ${last?.mapTop} (header ${last?.headerH} + toolbar ${last?.toolbarH})`)
check('the map itself says the path is a scenario', !!last?.mapKeyVisible && /scenario|สมมุติ/i.test(last?.mapKey || ''),
  `map key: ${last?.mapKey}`)
check('the scenario limitation is present in the wind panel', /not smoke arrival|ไม่ใช่เวลาควันถึง/.test(last?.limit || ''), `limit: ${last?.limit}`)
check('the page does NOT deny computing transport paths while shipping them', last?.denied === false,
  'the method narrative still says the page calculates no transport paths')

if (noWind) {
  skip(`the +1/+3/+6 path marks — the hourly wind feed is unavailable right now (${last?.windReading})`)
  skip('the step list — the hourly wind feed is unavailable right now')
  skip('the path summary — the hourly wind feed is unavailable right now')
} else {
  // The marks may be CLUSTERED at the country zoom — one chip carrying all
  // three hours, because an 18 km path is a few pixels across. What must
  // never happen is an hour quietly missing: the old de-collision loop
  // dropped two of the three and left a lone "+6h" on the map.
  check('no hour mark is dropped from the map', (last?.hourHours || []).join() === '1,3,6',
    `marks ${JSON.stringify(last?.hourMarks)} name ${JSON.stringify(last?.hourHours)}`)
  check('the step list names the three hours', (last?.steps || []).length === 3, `steps: ${JSON.stringify(last?.steps)}`)
  check('the path is labelled a scenario, with the distance', /สมมุติ|scenario/i.test(last?.summary || ''), `summary: ${last?.summary}`)

  // When the marks cannot be read apart, the map has to say so. A lone
  // "+6h" chip with no explanation reads as "there is only one step".
  const clustered = (last?.hourMarks || []).length < 3
  if (clustered) {
    check('the map says why the hour marks overlap', /overlap|too close|ทับกัน|ใกล้กัน/i.test(last?.mapKey || ''),
      `map key: ${last?.mapKey}`)
  } else {
    console.log('note: the marks were already separate at the country zoom')
  }

  // ── zoom to the path, and the three hour marks separate ────────────────
  await evaluate(`(() => { const b=document.getElementById('focus-wind'); if(b) b.click(); return !!b })()`)
  await sleep(4000)
  const focused = JSON.parse(await evaluate(READ))
  console.log(`\nafter "Zoom to +hour path": zoom ${last?.mapZoom} -> ${focused?.mapZoom}, marks ${JSON.stringify(focused?.hourMarks)}`)
  check('zooming to the path separates the +1/+3/+6 marks', (focused?.hourMarks || []).length === 3,
    `marks: ${JSON.stringify(focused?.hourMarks)}`)
  check('each separated mark names exactly one hour', (focused?.hourMarks || []).every(m => (m.match(/\d+h/g) || []).length === 1),
    `marks: ${JSON.stringify(focused?.hourMarks)}`)
  check('the separated marks are readable on screen (not overlapping)', minGap(focused?.markBoxes) >= 40,
    `closest pair ${minGap(focused?.markBoxes)}px`)
  if (clustered) {
    check('the focus actually zoomed in', (focused?.mapZoom ?? 0) > (last?.mapZoom ?? 0),
      `zoom ${last?.mapZoom} -> ${focused?.mapZoom}`)
  }
}

// ── focus survives a real viewport change ─────────────────────────────────
// The page exposes its map so this can be measured. Comparing two nulls
// would pass for the wrong reason: before the hook existed this check read
// null on both sides of the resize and called it a pass.
const parseJson = s => { try { return JSON.parse(s) } catch { return null } }
const before = parseJson(await evaluate(`JSON.stringify(window.__regionMap ? {lat:window.__regionMap.getCenter().lat,lng:window.__regionMap.getCenter().lng,zoom:window.__regionMap.getZoom()} : null)`))
await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 800, deviceScaleFactor: 1, mobile: false })
await sleep(4000)
const after = parseJson(await evaluate(`JSON.stringify(window.__regionMap ? {lat:window.__regionMap.getCenter().lat,lng:window.__regionMap.getCenter().lng,zoom:window.__regionMap.getZoom()} : null)`))
console.log(`\nmap before ${JSON.stringify(before)} · after a 390→1024 resize ${JSON.stringify(after)}`)
check('the map exposes its own state to the check', !!before && !!after,
  'the page did not expose window.__regionMap — this check would compare two nulls')
check('the map did not jump back to the country extent on resize',
  !!before && !!after && Math.abs(before.lat - after.lat) < 0.05 && Math.abs(before.lng - after.lng) < 0.05,
  `centre moved from ${before?.lat},${before?.lng} to ${after?.lat},${after?.lng}`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/tmp/region-390.png', Buffer.from(shot.data, 'base64'))
console.log('\nshot: /tmp/region-390.png')
console.log(`\n${failures} failed`)
ws.close(); try { child.kill('SIGKILL') } catch {}
process.exit(failures ? 1 : 0)
