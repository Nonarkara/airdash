// Flood-wall camera panel: stable per-province membership, self-healing.
import { choosePanel, localGrabUrl, usableSnapshotCam } from '../server/vision/floodWall.js'

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
