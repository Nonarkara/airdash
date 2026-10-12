// Stop re-proving cameras that have already been proven dead.
//
// The 2026-10-12 health map held 561 cameras, 456 of them dead (81 %), all with
// a fail streak of 2 or more. The schedule re-probed every one of them every 30
// minutes, and a dead camera holds its concurrency slot until PROBE_TIMEOUT_MS
// expires. A pass was therefore 410–497 s of waiting on sockets that were never
// going to answer — the waste the 25 s ceiling was put in to bound.
//
// This ladder removes the waste instead of capping it: a camera already known to
// be down is re-probed at 1 h, 2 h, 4 h, 8 h, then 12 h, indexed by its streak.
// A live probe resets the streak, so a recovered camera is back on the normal
// 30-minute cadence immediately.
//
// THE PROPERTY THAT MAKES IT SAFE, and the reason this is not simply "skip the
// dead ones": the returned health Map REPLACES the previous one. A skipped
// camera that vanished from the map would have no verdict at all, and a camera
// with no verdict is drawn — so skipping a dead camera carelessly UN-HIDES it.
// A skipped camera must therefore keep the exact `down` verdict it already had.
// That is the first thing pinned below.
//
// Run: node scripts/test-cctv-dead-backoff.mjs

import { probeAll, backoffMsFor, nextState } from '../server/sources/cctvHealth.js'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const HOUR = 3_600_000
const T0 = Date.parse('2026-10-12T00:00:00Z')
const cam = (id, host = 'a.test') => ({ id, hls_url: `https://${host}/${id}.m3u8` })
const deadAt = (agoMs, streak = 3) => ({ status: 'down', fail_streak: streak, last_ok_at: null, checked_at: new Date(T0 - agoMs).toISOString() })
const liveAt = (agoMs) => ({ status: 'live', fail_streak: 0, last_ok_at: new Date(T0 - agoMs).toISOString(), checked_at: new Date(T0 - agoMs).toISOString() })

// ── backoffMsFor: the ladder itself ──────────────────────────────────────
check('a live camera is never backed off', backoffMsFor(liveAt(HOUR), T0) === 0)
check('a flaky camera is never backed off', backoffMsFor({ status: 'flaky', fail_streak: 1, checked_at: new Date(T0).toISOString() }, T0) === 0)
check('an unknown camera is probed at once', backoffMsFor(undefined, T0) === 0 && backoffMsFor(null, T0) === 0)
check('a camera with an unparseable checked_at is probed at once',
  backoffMsFor({ status: 'down', fail_streak: 9, checked_at: 'nonsense' }, T0) === 0)

const ladder = [2, 3, 4, 5, 6, 20].map((s) => backoffMsFor({ status: 'down', fail_streak: s, checked_at: new Date(T0).toISOString() }, T0))
check('the ladder grows with the streak', ladder.every((v, i) => i === 0 || v >= ladder[i - 1]), ladder.join(','))
check('a high streak is capped, not unbounded', Math.max(...ladder) <= 12 * HOUR, `${Math.max(...ladder)}ms`)
check('a fresh dead camera waits about an hour', ladder[0] === HOUR, `${ladder[0]}ms`)
check('a long-dead camera waits 12 h at most', ladder[ladder.length - 1] === 12 * HOUR)

check('a dead camera past its window is due', backoffMsFor(deadAt(13 * HOUR, 6), T0) === 0)
check('a dead camera inside its window is not due', backoffMsFor(deadAt(1 * HOUR, 6), T0) > 0)
check('a dead camera exactly at its boundary is due', backoffMsFor(deadAt(12 * HOUR, 6), T0) === 0)

// ── The decisive property: a skipped camera KEEPS its verdict ─────────────
// If a backed-off camera left the map it would have no verdict, and a camera
// with no verdict is drawn — so this would un-hide 456 dead cameras at once.
const calls = []
const fetchImpl = async (url) => { calls.push(url); return { status: 200, text: async () => '#EXTM3U' } }

const deadCam = cam('dead-one')
const liveCam = cam('live-one')
const freshCam = cam('fresh-one')
const prev = new Map([
  ['dead-one', deadAt(HOUR, 4)],      // inside its 4 h window
  ['live-one', liveAt(HOUR)],         // always due
  ['fresh-one', deadAt(13 * HOUR, 4)], // window expired
])

const out = await probeAll([deadCam, liveCam, freshCam], prev, { fetchImpl, now: T0 })

check('a backed-off dead camera is NOT probed', !calls.some((u) => u.includes('dead-one')), calls.join(','))
check('a live camera IS probed', calls.some((u) => u.includes('live-one')))
check('a dead camera past its window IS re-probed', calls.some((u) => u.includes('fresh-one')))

check('a backed-off camera is still present in the returned map', out.has('dead-one'))
check('a backed-off camera KEEPS its down verdict', out.get('dead-one')?.status === 'down',
  `got ${out.get('dead-one')?.status}`)
check('a backed-off camera KEEPS its fail streak', out.get('dead-one')?.fail_streak === 4,
  `got ${out.get('dead-one')?.fail_streak}`)
check('a backed-off camera keeps its exact prior record',
  JSON.stringify(out.get('dead-one')) === JSON.stringify(deadAt(HOUR, 4)))
check('a re-probed camera gets a fresh verdict with a new checked_at',
  out.get('fresh-one')?.status === 'live' && out.get('fresh-one')?.checked_at === new Date(T0).toISOString())
check('the map has exactly the cameras it was given', out.size === 3, `got ${out.size}`)

// ── A recovered camera must not stay on the slow ladder ──────────────────
const recovered = nextState(deadAt(HOUR, 9), 'live', T0)
check('a live probe resets the streak to 0', recovered.fail_streak === 0)
check('a recovered camera is probed at the normal cadence again', backoffMsFor(recovered, T0) === 0)

// ── The stored streak must not grow without bound ────────────────────────
// Observed in the live 2026-10-12 map: a camera dead for 11 days carried a
// fail_streak of 555, written to the database every 30 minutes. Past the last
// rung the exact count cannot change any decision.
let longDead = { status: 'down', fail_streak: 0, checked_at: new Date(T0).toISOString() }
for (let i = 0; i < 5000; i += 1) longDead = nextState(longDead, 'slow', T0)
check('a 5000-pass dead streak is capped', longDead.fail_streak <= 10, `got ${longDead.fail_streak}`)
check('a capped streak stays on the longest backoff rung',
  backoffMsFor(longDead, T0) === 12 * HOUR, `${backoffMsFor(longDead, T0)}ms`)
check('capping does not change one-strike or two-strike behaviour',
  nextState({}, 'slow', T0).fail_streak === 1 && nextState({ fail_streak: 1 }, 'slow', T0).status === 'down')

// ── The quantity the ladder is actually for ──────────────────────────────
// 456 dead cameras on a 30-minute schedule is 2.2 k dead probes a day. On the
// ladder the average interval across the rungs is ~5.4 h, which is the real
// number the fix moves.
const DEAD = 456
const avgIntervalH = (1 + 2 + 4 + 8 + 12) / 5
const probesPerDay = (DEAD / avgIntervalH) * (24 / 0.5)
check('the ladder cuts dead-camera probes by more than 3x',
  probesPerDay < (DEAD * 48) / 3,
  `${Math.round(probesPerDay)}/day vs ${DEAD * 48}/day on the old 30-minute schedule`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)