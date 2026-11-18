// Flood-wall camera panel: stable per-province membership, self-healing.
import { choosePanel, localGrabUrl, usableSnapshotCam, panelHealthResults } from '../server/vision/floodWall.js'
import { grabMany } from '../server/vision/frameGrab.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const cam = (id, code) => ({ id, source: 'fw-maholan', province_code: code })
const cams = [...[1, 2, 3, 4, 5].map((i) => cam(`a${i}`, '50')), ...[1, 2].map((i) => cam(`b${i}`, '10'))]
const key = (c) => `${c.source}:${c.id}`

const p1 = choosePanel(cams, new Map(), { perProvince: 3 })
check('at most perProvince per province', p1.filter((c) => c.province_code === '50').length === 3)
check('small provinces keep all they have', p1.filter((c) => c.province_code === '10').length === 2)
check('deterministic', JSON.stringify(choosePanel(cams, new Map(), { perProvince: 3 }).map(key)) === JSON.stringify(p1.map(key)))

const now = Date.now()
const chosen50 = p1.filter((c) => c.province_code === '50')
const health = new Map([[key(chosen50[0]), { ok: 0, fails: 3, last_try: now - 3600_000 }]])
const p2 = choosePanel(cams, health, { perProvince: 3, now })
check('a camera failing 3× is benched and replaced', !p2.some((c) => key(c) === key(chosen50[0])) && p2.filter((c) => c.province_code === '50').length === 3)
const p3 = choosePanel(cams, new Map([[key(chosen50[0]), { ok: 0, fails: 3, last_try: now - 25 * 3600_000 }]]), { perProvince: 5, now })
check('benched camera is retried after a day', p3.some((c) => key(c) === key(chosen50[0])))
const proven = cams.find((c) => c.province_code === '50' && !p1.includes(c))
const p4 = choosePanel(cams, new Map([[key(proven), { ok: 40, fails: 0, last_try: now }]]), { perProvince: 3, now })
check('a proven camera is preferred', p4.some((c) => key(c) === key(proven)))

check('DWR snapshots go through FloodDash locally', localGrabUrl('https://flood.nonarkara.org/api/cctv/dwr?id=x', 'http://127.0.0.1:8340') === 'http://127.0.0.1:8340/api/cctv/dwr?id=x')
check('other hosts untouched', localGrabUrl('https://cctv.maholan.net/api/snap/a') === 'https://cctv.maholan.net/api/snap/a')
check('Bangkok BMA proxy rows skipped', !usableSnapshotCam({ id: 'floodbkk-1', snapshot_url: 'x', lat: 13, lng: 100 }))
check('ungeolocated skipped', !usableSnapshotCam({ id: 'a', snapshot_url: 'x' }))


// Panel health: a failed grab is a failure, an unattempted camera is no evidence.
{
  const a = { id: 'p1', source: 'fw-maholan' }, b = { id: 'p2', source: 'fw-maholan' }, c = { id: 'p3', source: 'fw-maholan' }, x = { id: 'x', source: 'gistda' }
  const frames = new Map([[a, Buffer.from('ok')], [b, null], [x, Buffer.from('ok')]])
  const r = panelHealthResults([a, b, c, x], new Set(['fw-maholan:p1', 'fw-maholan:p2', 'fw-maholan:p3']), frames)
  check('a grabbed panel camera is healthy', r.some((h) => h.key === 'fw-maholan:p1' && h.ok === true))
  check('a FAILED grab is recorded as a failure (was recorded healthy until 2026-11-18)', r.some((h) => h.key === 'fw-maholan:p2' && h.ok === false))
  check('an unattempted camera is not recorded at all', !r.some((h) => h.key === 'fw-maholan:p3'))
  check('non-panel cameras are not recorded', !r.some((h) => h.key === 'gistda:x'))
}

// grabMany deadline: nothing starts after it, unstarted cameras are left out, the run returns.
{
  const cams = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, snapshot_url: `http://h${i}.test/s.jpg`, stream_kind: 'snapshot' }))
  let started = 0
  const slow = () => { started++; return new Promise((res) => setTimeout(() => res(Buffer.from('f')), 60)) }
  const t0 = Date.now()
  const out = await grabMany(cams, { concurrency: 2, deadline: Date.now() + 30, grab: slow })
  check('grabs in flight at the deadline finish and are kept', started === 2 && [...out.values()].filter(Boolean).length === 2, `started ${started}`)
  check('cameras not started by the deadline are absent, not failed', out.size === 2)
  check('the run returns soon after the deadline', Date.now() - t0 < 500)
  const all = await grabMany(cams, { concurrency: 3, grab: () => Promise.resolve(Buffer.from('f')) })
  check('without a deadline every camera is grabbed', all.size === 6)
  const fails = await grabMany([{ id: 'f', snapshot_url: 'http://h.test/a.jpg', hls_url: 'http://h.test/a.m3u8', stream_kind: 'hls' }], { grab: (u) => u.endsWith('.m3u8') ? Promise.reject(new Error('x')) : Promise.resolve(Buffer.from('j')) })
  check('a failed stream still falls back to its snapshot', [...fails.values()][0] !== null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
