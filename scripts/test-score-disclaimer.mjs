// THE STANDING DISCLAIMER MUST SHIP WITH THE SCORE.
//
// The corpus bible (sec10.4, in both languages) names ONE sentence that must
// travel with the score everywhere. On this dashboard it lives in
// #risk-method-note, in the ranking panel's head.
//
// It had THREE writers, and only one of them was the right one:
//
//   header.js   → the server's method_th / method_en. The real sentence.
//   ranking.js  → the ranking-mode explanation, written on every language
//                 switch. Wrong message in the wrong place.
//   ops.html    → a data-i18n attribute, which i18n.paintChrome() rewrites
//                 from the static attribute on every language switch.
//
// Because initHeader() registers its 'lang' listener first, the sequence on
// a language switch was: header writes the mandated sentence, ranking
// overwrites it with the mode note, paintChrome overwrites it again with
// the static HTML. The mandated sentence then sat off the screen until the
// next snapshot — up to five minutes — every time anyone switched language.
//
// Measured live, not assumed: scripts/ops/check-method-note.mjs reproduces
// the sequence in a real browser and fails if the sentence goes missing.
//
// This guard is the static half: it holds the element's shape, the single
// owner, and the two copies of the sentence (server + HTML fallback) in
// step. It is mutation-tested — see the bottom of this file's history.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const ops = read('public/ops.html')
const risk = read('server/risk.js')
const ranking = read('public/js/panels/ranking.js')
const header = read('public/js/panels/header.js')
const i18n = read('public/js/i18n.js')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the sentence the server publishes ────────────────────────────────────
const methodTh = risk.match(/method_th:\s*'([^']+)'/)?.[1] ?? ''
const methodEn = risk.match(/method_en:\s*'([^']+)'/)?.[1] ?? ''

check('the server publishes the mandated Thai sentence',
  methodTh.includes('ไม่ใช่การพยากรณ์') && methodTh.includes('PM2.5 40%'),
  `method_th = ${methodTh}`)
check('the server publishes the mandated English sentence',
  /heuristic, not a forecast/i.test(methodEn) && methodEn.includes('PM2.5 40%'),
  `method_en = ${methodEn}`)
check('the server states every weight the bible names',
  ['PM2.5 40%', 'มลพิษอื่น 10%', 'แนวโน้ม 15%', 'พยากรณ์ 20%', 'การระบายอากาศ 15%'].every(w => methodTh.includes(w)),
  `method_th = ${methodTh}`)

// ── the element ──────────────────────────────────────────────────────────
const noteEl = ops.match(/<div[^>]*id="risk-method-note"[^>]*>/)?.[0] ?? ''
check('the panel head carries the disclaimer element', noteEl.length > 0, 'no #risk-method-note in ops.html')
check('the disclaimer element is NOT repainted by i18n.paintChrome()',
  !/data-i18n/.test(noteEl),
  'a data-i18n attribute lets paintChrome overwrite the mandated sentence with the static fallback')
check('the disclaimer element still shows the sentence before the first snapshot',
  ops.includes('ดัชนีเฝ้าระวังจากข้อมูลจริง (PM2.5 40%'),
  'the pre-snapshot fallback must already be the mandated sentence')

// ── one owner ────────────────────────────────────────────────────────────
// Count CLAIMS, not mentions. A file that merely discusses the element in a
// comment does not write to it — matching the bare id string would count
// this file's own explanation of the bug as a second writer, which is
// exactly the kind of check that flatters itself.
const claims = (src) => (src.match(/getElementById\(\s*['"]risk-method-note['"]\s*\)/g) ?? []).length
const writers = [
  ['panels/header.js', header],
  ['panels/ranking.js', ranking],
]
  .filter(([, src]) => claims(src) > 0)
  .map(([name]) => name)
check('exactly one module claims the disclaimer element',
  writers.length === 1 && writers[0] === 'panels/header.js',
  `writers: ${writers.join(', ') || 'none'}`)
check('the ranking panel no longer claims the disclaimer element',
  claims(ranking) === 0,
  'the ranking wrote the mode note into the mandated sentence\'s element')
check('the ranking panel renders the mode note in its OWN element',
  /rank-mode-note/.test(ranking) && /rank-mode-note/.test(read('public/css/components.css')),
  'the mode explanation needs a home that is not the mandated sentence')
check('the ranking mode explanation says what the mode means',
  /เรียงจาก PM2\.5 สูงสุดก่อน/.test(ranking) && /ภาระจริง = ดัชนีเฝ้าระวัง/.test(ranking),
  'both modes must explain their own order')

// ── the two copies of the sentence cannot drift ──────────────────────────
// The HTML fallback and the server publish the same words. If they drift,
// the reader sees one sentence before the snapshot and another after it.
const fallback = ops.match(/id="risk-method-note"[^>]*>([^<]+)</)?.[1]?.trim() ?? ''
check('the HTML fallback is the same sentence the server publishes',
  fallback === methodTh,
  `fallback "${fallback}" ≠ server "${methodTh}"`)

// ── paintChrome is the mechanism, so name it ─────────────────────────────
check('i18n.paintChrome() really does rewrite every data-i18n node',
  /querySelectorAll\('\[data-i18n\]'\)/.test(i18n) && /node\.textContent = tr\(/.test(i18n),
  'the guard above depends on this behaviour; if it changed, re-check the owner rule')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
