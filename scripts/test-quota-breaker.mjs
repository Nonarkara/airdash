// A daily quota is not a rate limit — retrying it is pure harm. Ported from
// FloodDash's 2026-09-01 outage (exhausted Open-Meteo allowance + retries →
// socket storm → dead process → crash loop on restart).
import { isDailyQuotaExhausted, markQuotaExhausted, quotaBlockMsRemaining } from '/Users/axiom/AirDash/server/util.js'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

check('detects Open-Meteo daily-limit wording (string)', isDailyQuotaExhausted('Daily API request limit exceeded. Please try again tomorrow.'))
check('detects the HTTP-200 error-object shape', isDailyQuotaExhausted({ error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' }))
check('a minutely/ordinary rate limit is NOT a spent day', !isDailyQuotaExhausted({ reason: 'Minutely API request limit exceeded' }))
check('unrelated errors are not quota', !isDailyQuotaExhausted('Internal Server Error'))
check('null/undefined never throw and are not quota', !isDailyQuotaExhausted(null) && !isDailyQuotaExhausted(undefined))

const om = 'https://api.open-meteo.com/v1/forecast?latitude=13'
const aq = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=13'
check('clean before marking', quotaBlockMsRemaining(om) === 0)
markQuotaExhausted(om)
check('marked host is blocked', quotaBlockMsRemaining(om) > 0)
check('block is host-scoped: the AQ host keeps its own allowance', quotaBlockMsRemaining(aq) === 0)
check('block never exceeds one day', quotaBlockMsRemaining(om) <= 24 * 3600_000 + 60_000)
check('malformed URL never throws or blocks', (() => { try { markQuotaExhausted('not a url'); return quotaBlockMsRemaining('not a url') === 0 } catch { return false } })())

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
