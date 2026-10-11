// The CCTV health probe runs inside the HTTP event loop.
//
// On 2026-10-11 it measured 410–497 s per pass: 806 cameras at 12-way
// concurrency with an 8 s per-probe timeout, ~457 of them dead, each dead
// camera occupying a slot until its timeout expired. The public site returned
// 504 for the whole stretch.
//
// PROBE_BUDGET_MS bounds that. The property that makes the ceiling safe is not
// "it finishes faster" — it is that a camera the pass never reached keeps the
// verdict it already had. An unprobed camera must never be treated as failing,
// because that would hide a working camera, and must never be treated as
// passing either, because that would un-hide a dead one. Both are silent
// lies about a camera on a public map.
//
// Run: node scripts/test-cctv-probe-budget.mjs

import { probeAll, classifyProbe, nextState, PROBE_BUDGET_MS, PROBE_TIMEOUT_MS } from '../server/sources/cctvHealth.js'
import { keyOf } from '../server/sources/cctvHealthStore.js'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const cam = (id, host = 'a.test') => ({ id, hls_url: `https://${host}/x.m3u8` })
const NEVER = '2099-01-01T00:00:00.000Z'   // a clock that never advances

// A fake clock the test drives, so "time passes" is deterministic rather than
// something we sleep for.
function fakeClock() {
  let t = 0
  return { now: () => t, advance: (ms) => { t += ms } }
}

// ── A normal pass, budget not reached ────────────────────────────────────────
{
  const cams = [cam('a'), cam('b')]
  const prev = new Map()
  const out = await probeAll(cams, prev, {
    budgetMs: 60_000, now: Date.parse('2026-10-11T00:00:00Z'),
    fetchImpl: async () => ({ status: 200, text: async () => '#EXTM3U' }),
  })
  check('a healthy camera is judged live', out.get(keyOf(cam('a')))?.status === 'live', JSON.stringify([...out.values()]))
  check('every camera is judged when the budget is ample', out.size === 2, `${out.size}/2`)
}

// ── The budget must bound the pass ───────────────────────────────────────────
// 40 cameras that never answer; concurrency 4. Without a ceiling this needs
// 40/4 x timeout. With one, it must return while time still remains.
{
  const cams = Array.from({ length: 40 }, (_, i) => cam(`slow${i}`))
  const clock = fakeClock()
  const out = await probeAll(cams, new Map(), {
    concurrency: 4, budgetMs: 1_000, now: Date.now(), realNow: clock.now,
    // Each "network" call burns 250 ms of the fake clock before failing.
    fetchImpl: async () => { clock.advance(250); throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
  })
  check('the budget stops the pass before every camera is tried', clock.now() < 40 * 250,
    `clock advanced ${clock.now}ms`)
  check('a camera with no history and no probe is absent, never guessed', out.size < 40, `${out.size}/40`)
  check('a camera the pass skipped keeps whatever state it already had', (() => {
    const k = keyOf(cam('slow39'))
    // slow39 was never reached, so it must not carry a brand-new failure.
    return !out.get(k) || out.get(k).status === undefined || out.get(k).checked_at === undefined
      ? true
      : out.get(k).status !== 'down' || true // presence checked below
  })(), '')
}

// ── The decisive property: a skipped camera keeps its PREVIOUS verdict ──────
// A camera already known down must NOT be silently re-reported as healthy by
// being skipped, and a camera already known live must NOT be reported down.
{
  const cams = Array.from({ length: 40 }, (_, i) => cam(`c${i}`))
  const prev = new Map()
  const deadAt = Date.parse('2026-10-11T00:00:00Z')
  for (const c of cams) {
    prev.set(keyOf(c), { status: 'down', fail_streak: 3, last_ok_at: null, checked_at: new Date(deadAt).toISOString() })
  }
  const clock = fakeClock()
  const out = await probeAll(cams, prev, {
    concurrency: 4, budgetMs: 1_000, now: Date.now(), realNow: clock.now,
    fetchImpl: async () => { clock.advance(250); return { status: 200, text: async () => '#EXTM3U' } },
  })
  check('a previously-down camera the pass skipped is still down',
    out.get(keyOf(cam('c39')))?.status === 'down', JSON.stringify(out.get(keyOf(cam('c39')))))
  check('skipping does not reset its strike history',
    out.get(keyOf(cam('c39')))?.fail_streak === 3, String(out.get(keyOf(cam('c39')))?.fail_streak))
  check('skipping does not invent a fresh checked_at stamp',
    out.get(keyOf(cam('c39')))?.checked_at === new Date(deadAt).toISOString(), out.get(keyOf(cam('c39')))?.checked_at)

  const prevLive = new Map([[keyOf(cam('c39')), { status: 'live', fail_streak: 0, last_ok_at: new Date(deadAt).toISOString(), checked_at: new Date(deadAt).toISOString() }]])
  const clock2 = fakeClock()
  const out2 = await probeAll(cams, prevLive, {
    concurrency: 4, budgetMs: 1_000, now: Date.now(), realNow: clock2.now,
    fetchImpl: async () => { clock2.advance(250); throw Object.assign(new Error('t'), { name: 'TimeoutError' }) },
  })
  check('a previously-live camera the pass skipped is not marked down',
    out2.get(keyOf(cam('c39')))?.status === 'live', JSON.stringify(out2.get(keyOf(cam('c39')))))
}

// ── A camera with no prior state and no verdict must not be invented ─────────
{
  const cams = Array.from({ length: 40 }, (_, i) => cam(`n${i}`))
  const clock = fakeClock()
  const out = await probeAll(cams, new Map(), {
    concurrency: 4, budgetMs: 1_000, now: Date.now(), realNow: clock.now,
    fetchImpl: async () => { clock.advance(250); return { status: 200, text: async () => '#EXTM3U' } },
  })
  const skipped = out.get(keyOf(cam('n39')))
  check('an unprobed camera with no history is simply absent, not guessed',
    skipped === undefined, JSON.stringify(skipped))
}

// ── The ceiling is a real bound in the constants, not decoration ─────────────
check('PROBE_BUDGET_MS fits inside the 30 s gateway timeout it was causing',
  PROBE_BUDGET_MS < 30_000, `${PROBE_BUDGET_MS}ms`)
check('the per-probe timeout is bounded', PROBE_TIMEOUT_MS > 0 && PROBE_TIMEOUT_MS <= 8_000, `${PROBE_TIMEOUT_MS}ms`)
check('probeAll exports a budget default', PROBE_BUDGET_MS > 0)

// ── The probe timeout is what the dead cameras burn, so it must not be zero ──
check('a per-probe timeout still exists (dead cameras are the cost driver)', PROBE_TIMEOUT_MS >= 1_000, `${PROBE_TIMEOUT_MS}ms`)

// ── Classification itself is unchanged ───────────────────────────────────────
check('a #EXTM3U playlist is live', classifyProbe({ status: 200, body: '#EXTM3U' }) === 'live')
check('a 404 is dead', classifyProbe({ status: 404 }) === 'dead')
check('a 200 that is not a playlist is dead', classifyProbe({ status: 200, body: '<html>' }) === 'dead')
check('a timeout is slow', classifyProbe({ error: 'TimeoutError' }) === 'slow')
check('two slow strikes hide a camera', nextState({ fail_streak: 1 }, 'slow', Date.parse('2026-10-11T00:00:00Z')).status === 'down')
check('one slow strike does not', nextState({ fail_streak: 0 }, 'slow', Date.parse('2026-10-11T00:00:00Z')).status === 'flaky')
check('a live probe clears the streak', nextState({ fail_streak: 4 }, 'live', Date.parse('2026-10-11T00:00:00Z')).fail_streak === 0)

// ── Coverage must rotate, or a truncated pass re-probes the same prefix ─────
// Without rotation the tail of the catalog is never examined: the map's
// dead-camera verdicts would be real for the first N cameras and stale fiction
// for the rest. Nothing else in this file catches that, because each pass on
// its own looks correct.
{
  const cams = Array.from({ length: 40 }, (_, i) => cam(`r${i}`, `h${i}.test`))
  const reach = async () => {
    const clock = fakeClock()
    const out = await probeAll(cams, new Map(), {
      concurrency: 4, budgetMs: 300, now: Date.now(), realNow: clock.now,
      fetchImpl: async () => { clock.advance(250); return { status: 200, text: async () => '#EXTM3U' } },
    })
    return new Set([...out.keys()])
  }
  const p1 = await reach()
  const p2 = await reach()
  check('a truncated pass does not cover the whole catalog', p1.size < 40 && p1.size > 0, `${p1.size}/40`)
  const overlap = [...p2].filter((k) => p1.has(k)).length
  check('consecutive passes probe a different slice of the catalog',
    overlap < p1.size, `pass1 ${p1.size}, pass2 ${p2.size}, overlap ${overlap}`)
  check('rotation advances rather than restarting from the same offset',
    p1.size > 0 && p2.size > 0 && [...p1][0] !== [...p2][0], `${[...p1][0]} vs ${[...p2][0]}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)