// Explainability contract for the Air Watch Score (server/verdict.js).
// A province is never allowed to sit in a non-normal band with an empty
// reason list — that is the exact failure found 2026-09-16, where 60% of
// the score (pollutants, trend, forecast, stagnation) moved a province to
// `watch` while provinceVerdict() returned zero reasons. No network, no DB.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { provinceVerdict } from '../server/verdict.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}
const base = { province_th: 'ทดสอบ', province_en: 'Test', province_code: '99', band: 'normal', score: 5, pm25: 12 }

// ── 1. The audited case: every component sub-alarm, band watch, must explain itself ──
{
  const v = provinceVerdict({
    ...base, band: 'watch', score: 30, pm25: 20,
    pollutant_worst: { metric: 'no2', value: 120, score: 45 },
    rise_6h_ug: 14, pm25_fc_24h: 30, pm25_fc_48h: 28,
    stagnation_comp: 55, wind_fc_kmh: 9, precip_prob_24h: 15,
  })
  check('watch band with only sub-alarm components has at least one reason', v.reasons.length >= 1,
    JSON.stringify(v.reasons))
  check('the rising PM2.5 (+14 in 6h) is named', v.reasons.some((r) => /\+14/.test(r.en)))
  check('the CAMS forecast above the good line is named', v.reasons.some((r) => /CAMS/.test(r.en) && /30/.test(r.en)))
  check('poor ventilation is named with the wind figure', v.reasons.some((r) => /Poor ventilation/.test(r.en) && /9 km\/h/.test(r.en)))
  check('the rising pollutant is named', v.reasons.some((r) => /NO2/.test(r.en)))
  check('every reason is bilingual', v.reasons.every((r) => r.th && r.en))
}

// ── 2. Moderate PM2.5 (25–37.5) — between "good" and "unhealthy" — is a reason, not silence ──
{
  const v = provinceVerdict({ ...base, band: 'watch', score: 22, pm25: 30 })
  check('PM2.5 30 µg/m³ (moderate) is named', v.reasons.some((r) => /30 µg/.test(r.en) && /moderate/.test(r.en)))
}

// ── 3. Alarm-level lines still take precedence over the mid-tier ones (else-if, not both) ──
{
  const v = provinceVerdict({ ...base, band: 'elevated', score: 50, pm25: 40, rise_6h_ug: 20 })
  check('unhealthy PM2.5 uses the alarm line, not the moderate line',
    v.reasons.some((r) => /starting to affect health/.test(r.en)) && !v.reasons.some((r) => /moderate/.test(r.en)))
  check('fast rise uses "climbing fast", not "rising"',
    v.reasons.some((r) => /climbing fast/.test(r.en)) && !v.reasons.some((r) => /PM2\.5 rising:/.test(r.en)))
}

// ── 4. A genuinely clean day stays silent — no reason invented ──
{
  const v = provinceVerdict({ ...base, pm25: 10, rise_6h_ug: 1, stagnation_comp: 10 })
  check('clean air produces no reasons', v.reasons.length === 0, JSON.stringify(v.reasons))
}

// ── 5. Cap is 5 and the snapshot carries all of them ──
{
  const v = provinceVerdict({
    ...base, band: 'high', score: 80, pm25: 90, rise_6h_ug: 30, pm25_fc_24h: 80,
    stagnation_comp: 70, pollutant_worst: { metric: 'o3', value: 130, score: 80 },
    washout_helps: true, precip_prob_24h: 70, washout_relief_pct: 30,
  })
  check('reasons capped at 5', v.reasons.length <= 5, `got ${v.reasons.length}`)
  check('at least 5 reasons survive on a fully-loaded province', v.reasons.length === 5, `got ${v.reasons.length}`)
  const risk = readFileSync(join(ROOT, 'server', 'risk.js'), 'utf8')
  check('risk.js carries the whole reason list into card (no slice(0, 2))',
    /reasons: v\.reasons,/.test(risk) && !/v\.reasons\.slice\(0, 2\)/.test(risk))
  check('risk.js max_province_score is a real max, not list[0]', /Math\.max\(\.\.\.list\.map/.test(risk))
}

// ── 6. The citizen panel renders the server card (not only band + score) ──
{
  const cz = readFileSync(join(ROOT, 'public', 'js', 'panels', 'citizen.js'), 'utf8')
  check('citizen.js reads live.card', /live\?\.card/.test(cz))
  check('citizen.js renders card.reasons', /card\.reasons/.test(cz))
  check('citizen.js renders the disclaimer', /card\.disclaimer_th/.test(cz))
}

// ── 7. LINE push unsubscribe line is in the subscriber's own language ──
{
  const lp = readFileSync(join(ROOT, 'server', 'linePush.js'), 'utf8')
  const m = lp.match(/const cancelLine = lang === 'en'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/)
  check('linePush: en branch is English, th branch is Thai', !!m && /^Cancel alerts/.test(m[1]) && /^ยกเลิก/.test(m[2]))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
