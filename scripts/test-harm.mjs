// Unit tests for Effective Harm (Watch × Social Load). No DB / network.
import {
  socialLoadScore,
  effectiveHarm,
} from '../server/harm.js'
import { PROVINCE_SOCIAL, SOCIAL_LOAD_WEIGHTS } from '../server/socialLoadData.js'
import { allProvinces } from '../server/provinces.js'

let pass = 0, fail = 0
const check = (name, cond) => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
}

// ── Coverage: all 77 DOPA codes ──────────────────────────────────────────
{
  const codes = allProvinces().map((p) => p.province_code)
  check('77 provinces in registry', codes.length === 77)
  const missing = codes.filter((c) => !PROVINCE_SOCIAL[c])
  check('social load covers every province', missing.length === 0)
  check('no extra social-load codes', Object.keys(PROVINCE_SOCIAL).length === 77)
}

// ── Formula clamps ───────────────────────────────────────────────────────
{
  check('effectiveHarm(0, 100) → 0', effectiveHarm(0, 100) === 0)
  check('effectiveHarm(100, 0) → 55', effectiveHarm(100, 0) === 55)
  check('effectiveHarm(100, 100) → 100', effectiveHarm(100, 100) === 100)
  check('effectiveHarm(50, 50) → 39', effectiveHarm(50, 50) === Math.round(50 * (0.55 + 0.45 * 0.5)))
  check('effectiveHarm null watch → null', effectiveHarm(null, 50) === null)
  check('effectiveHarm clamps above 100', effectiveHarm(200, 100) === 100)
}

// ── socialLoadScore weights ──────────────────────────────────────────────
{
  const row = { outdoor_labor: 100, income_strain: 0, sensitivity: 0, adaptive_deficit: 0 }
  check('outdoor-only score is 35', socialLoadScore(row) === Math.round(100 * SOCIAL_LOAD_WEIGHTS.outdoor_labor))
  const full = { outdoor_labor: 50, income_strain: 50, sensitivity: 50, adaptive_deficit: 50 }
  check('flat-50 social load is 50', socialLoadScore(full) === 50)
  check('missing row → null', socialLoadScore(null) === null)
}

// ── Equal watch: high outdoor ranks above metro ──────────────────────────
{
  const cm = socialLoadScore(PROVINCE_SOCIAL['50']) // Chiang Mai
  const bkk = socialLoadScore(PROVINCE_SOCIAL['10']) // Bangkok
  const mhs = socialLoadScore(PROVINCE_SOCIAL['58']) // Mae Hong Son
  check('Chiang Mai social > Bangkok', cm > bkk)
  check('Mae Hong Son social > Chiang Mai', mhs > cm)

  const watch = 60
  const harmCm = effectiveHarm(watch, cm)
  const harmBkk = effectiveHarm(watch, bkk)
  const harmMhs = effectiveHarm(watch, mhs)
  check('equal watch: CM harm > BKK harm', harmCm > harmBkk)
  check('equal watch: MHS harm > CM harm', harmMhs > harmCm)
}

// ── Clean air stays low even with high social load ───────────────────────
{
  const mhs = socialLoadScore(PROVINCE_SOCIAL['58'])
  const harm = effectiveHarm(5, mhs)
  check('low watch + high social stays below watch band (~20)', harm < 20)
}

// ── Engine always covers 77, even with sparse risk ───────────────────────
{
  const { createHarm } = await import('../server/harm.js')
  const sparse = {
    get: () => ({
      updated: 'sparse-test',
      provinces: [
        { province_code: '10', province_th: 'กทม', province_en: 'Bangkok', score: 40 },
      ],
    }),
  }
  const list = createHarm({ riskEngine: sparse }).get()
  check('sparse risk still yields 77 harm rows', list.length === 77)
  const mhs = list.find((p) => p.province_code === '58')
  check('Mae Hong Son present without live risk row', !!mhs)
  check('missing risk row → watch_live false', mhs?.watch_live === false)
  check('missing risk row → watch_score 0', mhs?.watch_score === 0)
  const bkk = list.find((p) => p.province_code === '10')
  check('live risk row → watch_live true', bkk?.watch_live === true)
  check('live risk row keeps watch score', bkk?.watch_score === 40)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
