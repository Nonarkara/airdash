// The regional page's claims about its own air-movement paths.
//
// WHY THIS GUARD EXISTS
// The regional page shipped an hourly wind path (+1/+3/+6 hours) in
// 2.4.117. The method narrative further down the same page still said:
//
//   "This page does not calculate transport paths or arrival times."
//
// Both sentences were true at different times. Only one of them is true
// now, and they are four hundred pixels apart, so a reader of the method
// section was told the page does not do the thing the page is doing. The
// page had become its own contradiction — the exact failure the product's
// own discipline exists to prevent, in the one place a careful reader
// goes to check what a number means.
//
// The contract this holds:
//
//   1. The page ships the path UI.
//   2. The page does NOT deny calculating paths.
//   3. The page says what the path IS — a wind-based air-movement
//      scenario, not smoke transport and not AQI.
//   4. The page still says what the path is NOT — no plume rise, no
//      dispersion, no rain removal, no terrain.
//
// Point 4 matters as much as point 3. Correcting "this page calculates no
// paths" by deleting the caveat would be the wrong fix: the honest claim
// is that the page computes a WIND scenario, which is not the same as
// smoke arriving.
//
// Every claim is held in BOTH languages. A check that reads one language
// cannot see the other, and this page is bilingual by construction.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const page = readFileSync(join(ROOT, 'public/region.html'), 'utf8')
const view = readFileSync(join(ROOT, 'public/js/regional-wind-view.js'), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// The page carries every sentence TWICE: once as the visible text and once
// inside data-t="ไทย|English", which is what the language switch reads.
// A guard that searches the whole file therefore sees the claim even when
// the copy a reader actually sees has been deleted — which is exactly how
// two of this guard's mutations first slipped through. Each claim is
// checked in BOTH copies, and the rendered copy is checked on its own.
const cookedLi = (() => {
  const all = [...page.matchAll(/<li data-t="([^"]*)">([^<]*)<\/li>/g)]
  return all.find(m => m[2].includes('Cooked:')) ?? null
})()
const limitP = page.match(/<p class="scenario-limit" data-t="([^"]*)">([^<]*)<\/p>/)
const cookedText = cookedLi?.[2] ?? ''
const cookedAttr = cookedLi?.[1] ?? ''
const limitText = limitP?.[2] ?? ''
const limitAttr = limitP?.[1] ?? ''

check('the method narrative and the scenario caveat were found to read',
  !!cookedLi && !!limitP, 'the page structure changed and this guard is now reading nothing')

// ── 1. the page ships the feature ─────────────────────────────────────────
check('the page ships the path controls', /id="focus-wind"/.test(page) && /id="wind-steps"/.test(page))
check('the page draws hour marks', /wind-hour-mark/.test(view) && /HOUR_STEPS/.test(view))

// ── 2. no denial of a feature the page has ───────────────────────────────
// Checked in the RENDERED copy and in the data-t copy separately.
check('the rendered narrative does not deny calculating transport paths (EN)',
  !/does not calculate transport paths|does not calculate .{0,40}arrival times/i.test(cookedText),
  `rendered: ${cookedText.slice(-90)}`)
check('the Thai narrative does not deny calculating transport paths',
  !/ไม่มีเส้นทางหรือเวลาถึงที่คำนวณในหน้านี้/.test(cookedAttr))
check('no copy anywhere on the page denies calculating transport paths',
  !/does not calculate transport paths|ไม่มีเส้นทางหรือเวลาถึงที่คำนวณในหน้านี้/.test(page))

// ── 3. the page says what the path IS ────────────────────────────────────
check('the rendered caveat says the path is a scenario, not smoke arrival or AQI (EN)',
  /not smoke arrival or AQI/i.test(limitText), `rendered: ${limitText.slice(0, 90)}`)
check('the Thai caveat says the path is a scenario, not smoke arrival or AQI',
  /ไม่ใช่เวลาควันถึงหรือค่า AQI/.test(limitAttr))
check('the rendered narrative says the path is built on wind, not dispersion (EN)',
  /wind-based air-movement scenarios, not smoke dispersion or AQI/i.test(cookedText),
  `rendered: ${cookedText.slice(-90)}`)
check('the Thai narrative says the path is built on wind, not dispersion',
  /เป็นสถานการณ์การเคลื่อนอากาศตามลม ไม่ใช่การแพร่กระจายควันหรือค่า AQI/.test(cookedAttr))

// ── 4. the page still says what the path is NOT ──────────────────────────
// Correcting a stale denial must not become an unearned claim.
check('the rendered caveat still names the physics it omits (EN)',
  /Omits plume rise, dispersion, rain removal and terrain/i.test(limitText), `rendered: ${limitText.slice(0, 120)}`)
check('the Thai caveat still names the physics it omits',
  /ไม่จำลองความสูงควัน การกระจาย ฝนชะล้าง หรือภูเขา/.test(limitAttr))
check('the page still points at real dispersion modelling for real predictions',
  /ready\.noaa\.gov\/HYSPLIT/.test(page))

// ── 5. the no-data behaviour stays honest ────────────────────────────────
// A path drawn from a missing or stale forecast would be the worst case on
// this page, so the code must refuse rather than guess.
check('no path is drawn when the wind is missing or stale',
  /No path drawn with missing or stale winds/.test(view) && /if\(!w\)/.test(view))
check('the path summary marks an incomplete path',
  /stopped at data\/grid gap/.test(view))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
