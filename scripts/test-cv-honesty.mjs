// The camera button must not claim a measurement the vision pipeline does not
// make.
//
// public/js/cctvEntry.js rendered "N scored · none smoky", where "smoky" came
// from an API `tint` block counted over `tint_hint`. Commit 18444ed replaced
// the tint_hint write with a literal null when it moved the verdict to a
// per-camera baseline, so both tint counts have been permanently 0 — and
// `flagged = smoke + fog` was therefore always 0, so the button asserted, with
// a number beside it, that it had looked and found no smoke. It had stopped
// looking. That is the failure this file exists to prevent: an always-zero
// field is worse than an absent one, because absent is honest.
//
// These checks EXECUTE the real readoutText rather than grepping for strings,
// so a rewrite that keeps the claim but changes the wording is still caught.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

const root = join(import.meta.dirname, '..')
const entrySrc = readFileSync(join(root, 'public/js/cctvEntry.js'), 'utf8')
const apiSrc = readFileSync(join(root, 'server/api.js'), 'utf8')

// ── Extract the real function and run it ────────────────────────────────────
const start = entrySrc.indexOf('function readoutText(')
check('readoutText is present in cctvEntry.js', start !== -1)
const end = entrySrc.indexOf('\n}\n', start)
check('readoutText has a findable end', end !== -1)
const fnSrc = entrySrc.slice(start, end + 3)

// tr(th, en) -> en is enough to assert on the English sentence.
const readoutText = new Function('tr', `${fnSrc}\nreturn readoutText`)((_th, en) => en)

// ── The claim that was wrong ────────────────────────────────────────────────
const out = readoutText({ scored: 144, possible_haze: 0 })
check('a clean window does not claim smoke was looked for and not found',
  !/smoky/i.test(out), `still says: ${JSON.stringify(out)}`)
check('a clean window says something true about the comparison that was made',
  /reference/i.test(out), `says nothing about what was compared: ${JSON.stringify(out)}`)

const dirty = readoutText({ scored: 144, possible_haze: 5 })
check('a flagged window reports the flagged count', /\b5\b/.test(dirty) && /possible haze/i.test(dirty),
  JSON.stringify(dirty))
check('a flagged window does not call it smoke', !/smoky/i.test(dirty), JSON.stringify(dirty))

// ── No number, no sentence ─────────────────────────────────────────────────
check('no scored count means no readout at all', readoutText({ possible_haze: 3 }) === '')
check('a missing flagged field degrades to the count alone',
  readoutText({ scored: 144 }) === '144 scored', JSON.stringify(readoutText({ scored: 144 })))
check('the count alone still makes no smoke claim',
  !/smok|none hazy|hazy/i.test(readoutText({ scored: 144 })))

// ── The API must not republish the dead block ───────────────────────────────
check('/api/haze-vision publishes the measured possible-haze count',
  /possible_haze:\s*rows\.filter\(\(r\) => r\.haze_status === 'possible-haze'\)/.test(apiSrc))
check('/api/haze-vision no longer publishes the always-zero tint block',
  !/smoke_like: rows\.filter/.test(apiSrc) && !/fog_like: rows\.filter/.test(apiSrc),
  'the tint block is back — both counts are structurally zero again')
check('the appearance split is declared unavailable rather than omitted',
  /appearance_split:\s*null/.test(apiSrc))
check('the frontend no longer reads a tint block',
  !/\.tint\?\./.test(entrySrc) && !/d\.tint\b/.test(entrySrc))

// ── The writer that started it ─────────────────────────────────────────────
const visionSrc = readFileSync(join(root, 'server/vision/hazeVision.js'), 'utf8')
const insert = visionSrc.slice(visionSrc.indexOf('INSERT INTO cctv_haze_frames'))
check('tint_hint is not written as a literal null',
  !/r\.features\.warmBias,\s*r\.features\.meanLuma,\s*null,/.test(insert),
  'the INSERT still discards every tint value it is handed')
// The trap: readFrame returns tintHint at the TOP level. There is no
// `features.tintHint`, so reading it there yields undefined — which writes a
// bare null again and passes every other check here.
check('tint_hint reads the top-level field, not the absent features field',
  /r\.tintHint/.test(insert) && !/r\.features\.tintHint/.test(insert),
  'r.features.tintHint is undefined — the INSERT would store null again')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)