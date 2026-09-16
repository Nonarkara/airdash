// The FloodDash relay (server/sources/twin-flood.js) and the two joint
// reasons it adds to the air verdict. No DB, no network.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parseTwin, readTwinFlood, floodByCode, KV_KEY } from '../server/sources/twin-flood.js'
import { provinceVerdict } from '../server/verdict.js'
import { SOURCES } from '../server/sources-catalog.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

const FLOOD = {
  system: 'flooddash', domain: 'flood', version: '4.27.0', updated: '2026-09-16T12:00:00.000Z',
  provinces: [
    { code: '55', th: 'น่าน', en: 'Nan', score: 61, band: 'elevated', level: 'prepare', head_th: 'ควรเตรียมพร้อม', head_en: 'Prepare now',
      reason_th: 'น้ำขึ้น', reason_en: 'rising', stations_l5: 1, stations_l4: 2, rain_24h_mm: 88.5, wetness_band: 'saturated', eta_hours: 9.5 },
    { code: '10', th: 'กรุงเทพมหานคร', en: 'Bangkok', score: 12, band: 'normal', level: 'watch', stations_l5: 0, stations_l4: 0, eta_hours: null },
    { code: 7, th: 'not a string code' },
  ],
}

// ── relay ──
{
  const t = parseTwin(FLOOD)
  check('parseTwin keeps only string-coded rows', t.provinces.length === 2)
  check('flood fields carried', t.provinces[0].stations_l5 === 1 && t.provinces[0].rain_24h_mm === 88.5 && t.provinces[0].eta_hours === 9.5)
  check('null eta stays null', t.provinces[1].eta_hours === null)
  let threw = false; try { parseTwin({ system: 'airdash', domain: 'air', provinces: [{ code: '1' }] }) } catch { threw = true }
  check('an airdash payload is refused', threw)
  threw = false; try { parseTwin({ system: 'flooddash', domain: 'flood', provinces: [] }) } catch { threw = true }
  check('an empty payload is refused', threw)
  const fresh = { ...t, fetched_at: '2026-09-16T12:00:00.000Z' }
  const db = { kvGet: (k) => (k === KV_KEY ? JSON.stringify(fresh) : null) }
  const at = Date.parse('2026-09-16T12:20:00.000Z')
  check('readTwinFlood returns a fresh relay', readTwinFlood(db, at)?.provinces.length === 2)
  check('readTwinFlood returns null after 1 h', readTwinFlood(db, at + 2 * 3600 * 1000) === null)
  check('readTwinFlood survives missing / broken kv', readTwinFlood({ kvGet: () => null }, at) === null && readTwinFlood({ kvGet: () => '{nope' }, at) === null)
  check('floodByCode indexes by code', floodByCode(readTwinFlood(db, at)).get('55').level === 'prepare')
}

// ── joint reasons ──
const base = { province_th: 'น่าน', province_en: 'Nan', province_code: '55', band: 'watch', score: 30, pm25: 30 }
{
  const flood = { level: 'prepare', stations_l5: 1, head_th: 'ควรเตรียมพร้อม', head_en: 'Prepare now' }
  const v = provinceVerdict({ ...base, flood })
  const r = v.reasons.find((x) => /FloodDash/.test(x.en) && /prepare/.test(x.en))
  check('flood at prepare is named with its headline and overflowing gauge', !!r && /1 gauge overflowing/.test(r.en) && /Prepare now/.test(r.en), JSON.stringify(v.reasons))
  check('the flood line is bilingual and says เตรียมพร้อม', !!r && /เตรียมพร้อม/.test(r.th))
  const without = provinceVerdict({ ...base, flood: null })
  check('the flood join never moves the air level', v.level === without.level)
}
{
  const v = provinceVerdict({ ...base, washout_helps: true, precip_prob_24h: 70, washout_relief_pct: 30, flood: { level: 'watch', stations_l5: 0 } })
  const joint = v.reasons.find((x) => /raise the rivers/.test(x.en))
  check('washout + flood watch yields the "same rain" insight', !!joint, JSON.stringify(v.reasons))
  check('the insight says may, never will', !!joint && !/\bwill\b/.test(joint.en) && !/จะ/.test(joint.th) && /อาจ/.test(joint.th))
  check('flood at watch alone does not add the flood-verdict line', !v.reasons.some((x) => /FloodDash: this province/.test(x.en)))
}
{
  const v = provinceVerdict({ ...base, washout_helps: true, precip_prob_24h: 70, washout_relief_pct: 30, flood: { level: 'safe' } })
  check('washout with a calm flood side stays a plain relief line', !v.reasons.some((x) => /raise the rivers/.test(x.en)))
  const none = provinceVerdict({ ...base, washout_helps: true, precip_prob_24h: 70, washout_relief_pct: 30 })
  check('no relay → no flood lines at all', !none.reasons.some((x) => /FloodDash/.test(x.en)))
}

// ── wiring ──
{
  const entry = SOURCES.find((s) => s.id === 'twin_flood')
  check('twin_flood is catalogued with the FloodDash URL', !!entry && /flood\.nonarkara\.org\/api\/twin/.test(entry.url))
  const index = readFileSync(join(ROOT, 'server', 'index.js'), 'utf8')
  check('index.js registers the source', /twinFlood[,\]]/.test(index))
  const risk = readFileSync(join(ROOT, 'server', 'risk.js'), 'utf8')
  check('risk.js joins p.flood', /p\.flood = /.test(risk))
  const config = readFileSync(join(ROOT, 'server', 'config.js'), 'utf8')
  check('config has the twin_flood interval', /twin_flood: 10 \* MINUTE/.test(config))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
