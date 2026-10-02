// The top bar must not crush the verdict, clip a control, or wrap silently.
//
// THE BUGS THIS EXISTS FOR
// v3 shipped a shed ladder whose breakpoints were guesses. A browser sweep
// of 11 widths found the bar over-subscribed at 5 of them, and every fix
// since has been a function of the same four structural mistakes. They are
// all STATIC properties of the stylesheet, so they can be asserted without
// a browser — which matters here because the project has zero npm
// dependencies and no CI, and the thing that is checked must be the thing
// that is shipped.
//
//   1. THE VERDICT HAD NO FLOOR. .hd-data could shrink to nothing. Measured
//      484px of real content, a 20px box, and "ดัชนีอันตรา" clipped mid-word.
//   2. .national HAD NO MAX-WIDTH. Its max-content is the un-ellipsized Thai
//      verb — measured 1443px. flex: 1 1 200px does not bound that, so the
//      data zone's flex-basis became 1757px and the bar wrapped at EVERY
//      width from 1920 down. This was the real cause and it was invisible
//      to the clipping check; only the screenshot showed it.
//   3. .hd-tools ALLOWED SHRINK-AND-CLIP. flex: 0 1 auto lets the zone take
//      less than its content, and the difference is clipped — which is the
//      failure the pre-v3 header comment already warns about by name:
//      "overflow:hidden was silently eating every control that did not fit".
//   4. THE ZONES BROKE THE PHONE GRID. Below 1100px the header is a
//      deliberate 3-row GRID whose placement rules target .national,
//      .danger, #ask-btn, .modetoggle, .searchbox and #langtoggle DIRECTLY.
//      Wrapping them in .hd-data / .hd-tools made those rules dead code and
//      the two wrappers auto-placed into rows 1 and 2 — measured: a 105px
//      header where the verdict had 20px and the Danger Score had 249px.
//
// The layout itself is verified for real by scripts/header-width-gate.mjs,
// which drives a browser across 19 widths. This file is the part that runs
// in `npm test` with no browser and no network.

import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../public/css/layout.css', import.meta.url), 'utf8')
const ops = readFileSync(new URL('../public/ops.html', import.meta.url), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

/** The last declaration block that sets `prop` on a selector matching
 * `selectorRe`.
 *
 * A regex over the raw stylesheet is the obvious implementation and it is
 * WRONG here: this file's comments contain braces, so a `[^{}]*` prefix
 * stops matching and every rule silently reports as absent — a test that
 * passes vacuously while the property it guards is missing. So strip
 * comments first, then scan with a brace counter.
 */
function allRules(selectorRe) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')   // no braces inside comments
  const re = /([^{}]+)\{([^{}]*)\}/g
  const out = []
  let m
  while ((m = re.exec(clean))) {
    if (selectorRe.test(m[1])) out.push({ sel: m[1].trim(), body: m[2] })
  }
  return out
}

function lastRule(selectorRe, prop) {
  let last = null
  for (const r of allRules(selectorRe)) {
    if (new RegExp('(?:^|;)\\s*' + prop + '\\s*:').test(r.body)) last = r
  }
  return last
}

// ── 1. The verdict has a floor ────────────────────────────────────────────
// Assert a PIXEL floor exists somewhere for the desktop bar. A bare
// "last rule wins" check is wrong here: the phone overrides legitimately
// set min-width:0 inside their own max-width queries, and that is correct
// — the phone gives the space to the grid instead. What must not happen is
// the floor being absent everywhere.
const dataFloors = allRules(/header \.hd-data\s*$/)
  .map((r) => r.body.match(/min-width:\s*(\d+)px/)?.[1])
  .filter(Boolean)
  .map(Number)
check('.hd-data declares a pixel min-width floor for the desktop bar',
  dataFloors.length > 0,
  'NO PIXEL FLOOR — the verdict can shrink to nothing on desktop. The phone overrides set min-width:0 inside their own max-width queries, which is correct; this is about the base rule.')

// ── 2. The verdict is capped ──────────────────────────────────────────────
const natMax = lastRule(/header \.hd-data \.national/, 'max-width')
check('.national declares a max-width (bounds the Thai verb max-content)',
  Boolean(natMax) && /max-width:\s*\d+px/.test(natMax.body),
  natMax ? `found: ${natMax.body.match(/max-width:[^;]*/)}` : 'NO RULE — an uncapped verdict measured 1443px and wrapped the bar at every width')

// ── 3. The tools zone may not shrink-and-clip ─────────────────────────────
const toolsRules = [...css.matchAll(/([^{}]*header \.hd-tools\s*\{)([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
const clipping = toolsRules.filter((r) => /overflow:\s*hidden/.test(r.body))
check('.hd-tools never uses overflow:hidden',
  clipping.length === 0,
  clipping.map((r) => `${r.sel} { ${r.body.trim()} }`).join('\n       '))
const toolsFlex = lastRule(/header \.hd-tools\s*$/, 'flex')
check('.hd-tools is flex: 0 0 auto (gives way by wrapping, not by clipping)',
  Boolean(toolsFlex) && /flex:\s*0 0 auto/.test(toolsFlex.body),
  toolsFlex ? `found: ${toolsFlex.body.match(/flex:[^;]*/)}` : 'NO FLEX RULE')

// ── 4. The phone grid still owns the header below 1100px ──────────────────
const dissolve = /@media \(max-width: 1100px\)[\s\S]{0,400}?header \.hd-data,\s*\n\s*header \.hd-tools\s*\{\s*\n?\s*display:\s*contents;/
check('below 1100px the zones dissolve (display:contents) so the phone grid works',
  dissolve.test(css),
  'The ≤1100 header is a 3-row GRID targeting .national/.danger/#ask-btn/.searchbox/#langtoggle directly. Wrapping them in zones makes those placements dead code.')
check('the camera chip is given its own grid seat rather than auto-placing a 4th row',
  /#cctv-wall-btn\s*\{\s*grid-column:/.test(css))

// Touch geometry must not leak above the phone breakpoint. --ctl-h-touch
// is 44px — the WCAG 2.5.5 minimum for a TARGET, and a 1101–1250px window
// is overwhelmingly a mouse. This block was once written at ≤1250 and it
// cost 12px of height on the tightest widths on the bar, which then
// wrapped at 1101px. It also carried the search field's `display:none`,
// so search was visible at 1250, gone across 1201–1102, and back at ≤1100
// where the phone grid re-showed it with !important: a control that left
// and returned with no ladder step explaining it.
const touchRules = [...css.matchAll(/@media \((max-width: (\d+)px)\) \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)]
  .filter((m) => /--ctl-h-touch/.test(m[3]))
  .map((m) => +m[2])
check('touch geometry (--ctl-h-touch) appears only at 1100px and below',
  touchRules.every((w) => w <= 1100),
  `appears at: ${touchRules.filter((w) => w > 1100).join(', ')} — 44px targets on a mouse-driven bar`)

// The search field's width was spread over five media queries in five
// places in a 2600-line file, resolved by SOURCE ORDER, and had produced a
// non-monotonic result (1400px got 96px, 1300px got a wider 108px). It is
// now one ordered ladder. Three properties of it are worth pinning: it is
// non-empty, it is strictly decreasing, and every step releases
// `min-width` so the pre-existing `.searchbox { min-width: 180px }` at
// layout.css:687 cannot beat it.
//
// The steps are `min-width: 1101px AND max-width: N`, and the lower bound
// is the point, not decoration. These rules budget ONE field sharing a
// single row with every other tool, which is only true above the phone
// breakpoint. Scoped by max-width alone, the last step pinned the phone's
// full-width search to 88px — on a 390px phone the main way to find a
// place was an 88px box.
//
// Note the emptiness check. Rewriting the ladder to add the lower bound
// changed this rule's shape, and the obvious regex then matched NOTHING —
// at which point `.every()` over an empty array is trivially true and the
// two assertions below would have gone green while guarding nothing. A
// guard that cannot fail is worse than no guard, so the first assertion is
// that the list is not empty.
const searchSteps = [...css.matchAll(
  /@media \(min-width: (\d+)px\) and \(max-width: (\d+)px\) \{\s*header \.hd-tools #place-search-container \{([^}]*)\}/g)]
  .map((m) => ({ lo: +m[1], w: +m[2], max: +(m[3].match(/max-width:\s*(\d+)px/)?.[1] ?? 0), min0: /min-width:\s*0/.test(m[3]) }))
  .sort((a, b) => b.w - a.w)
check('the search ladder exists and has steps (a zero-match regex passes .every() trivially)',
  searchSteps.length >= 4,
  `matched ${searchSteps.length} steps — if this is 0 the two checks below are vacuous`)
check('the search ladder is a single monotonic run (no rule duplicated elsewhere)',
  searchSteps.length > 0 && searchSteps.every((s, i) => i === 0 || s.max <= searchSteps[i - 1].max),
  `widths ascend with narrower viewports: ${searchSteps.map((s) => `${s.w}→${s.max}`).join(' ')}`)
check('every search step releases min-width (the 180px floor cannot win it)',
  searchSteps.length > 0 && searchSteps.every((s) => s.min0),
  `steps without min-width:0 — ${searchSteps.filter((s) => !s.min0).map((s) => s.w).join(', ')}`)
check('the search ladder is scoped ABOVE the phone breakpoint only',
  searchSteps.length > 0 && searchSteps.every((s) => s.lo > 1100),
  `steps that also apply to the phone grid: ${searchSteps.filter((s) => s.lo <= 1100).map((s) => s.w).join(', ')} — on a phone this pins a full-width field to 88px`)

// ── 5. The bar is one row where it claims to be ───────────────────────────
// The ladder is a list of max-width steps; it is worthless if it has no
// steps, and worse if the first version of it had none that mattered.
const steps = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => +m[1])
const ladder = steps.filter((w) => w > 1100)
check('the shed ladder has steps above the phone breakpoint',
  ladder.length >= 6, `only ${ladder.length} steps: ${ladder.join(', ')}`)
// Monotonicity is NOT an invariant of this file — it holds unrelated media
// queries from the pre-v3 sheet (1620, 1480, 1280, 1180), so asserting it
// would be asserting a falsehood. The ladder's actual job is COVERAGE: no
// desktop width may fall between two steps and be left to chance.
const bands = [[1900, 2200], [1800, 1900], [1600, 1800], [1400, 1600], [1200, 1400]]
const uncovered = bands.filter(([lo, hi]) => !ladder.some((w) => w >= lo && w < hi))
check('the ladder has a step in every desktop band',
  uncovered.length === 0, `uncovered: ${uncovered.map(([a, b]) => a + '-' + b).join(', ')}`)

// ── 6. The zones still exist in the markup ────────────────────────────────
check('ops.html has the .hd-data zone', /class="hd-data"/.test(ops))
check('ops.html has the .hd-tools zone', /class="hd-tools"/.test(ops))
// And every control lives in exactly one of them — a control left outside
// the tools zone misses every rule the ladder applies.
const header = ops.slice(ops.indexOf('<header>'), ops.indexOf('</header>'))
const toolsZone = header.slice(header.indexOf('class="hd-tools"'))
const stray = [...header.matchAll(/<(?:button|a)\b[^>]*\bid="([a-z0-9-]+)"/g)]
  .map((m) => m[1])
  .filter((id) => {
    const at = header.indexOf(`id="${id}"`)
    return at > 0 && at < header.indexOf('class="hd-tools"') && !['danger-hero'].includes(id)
  })
check('no header control sits outside the tools zone',
  stray.length === 0, `outside .hd-tools: ${stray.join(', ')}`)

// ── 7. The Danger chip is a grid, and the score cannot be split ───────────
// A column flex box holding five pieces of content in a fixed 64px does not
// report that it does not fit — with the default `flex-shrink: 1` it quietly
// makes every row shorter (measured: label 17→16.2, number 30→26, band
// 13→12.6, scope 10→6.2) and the scope line, which says WHICH province the
// 0–100 applies to, lost the tops of its Thai vowel marks. No overflow, no
// clip, nothing for any check to catch.
const dangerRule = lastRule(/^\s*\.danger\s*$/, 'display')
check('.danger lays out as a grid, not a shrinkable column flex',
  Boolean(dangerRule) && /display:\s*grid/.test(dangerRule.body),
  dangerRule ? `found: ${dangerRule.body.match(/display:[^;]*/)}` : 'NO RULE — the chip returns to shrink-and-hide')
// Assert the BASE rule, not the last one. The ≤480px phone block
// deliberately overrides this to two columns (caveat + score on one row,
// scope beneath), so "last rule wins" would be asserting that the phone
// is wrong. The desktop arrangement is the one that regressed.
const dangerCols = allRules(/^\s*\.danger\s*$/).find((r) => /(?:^|;)\s*grid-template-columns\s*:/.test(r.body))
check('.danger uses a single column (a spanning label otherwise steals the number\'s track)',
  Boolean(dangerCols) && /min-content/.test(dangerCols.body),
  dangerCols ? `found: ${dangerCols.body.match(/grid-template-columns:[^;]*/)}` : 'NO COLUMN RULE')
// The number and its band must be ONE element, or the label and scope — which
// span the chip — distribute their width across the tracks and push them to
// opposite sides. Measured with them as siblings: a 30px number centred in a
// 63.5px track, band on the far side, chip centre empty.
const mainBox = ops.match(/<div class="danger-main">([\s\S]*?)<\/div>/)
check('ops.html wraps the number and the band in one .danger-main box',
  Boolean(mainBox) && /id="danger-num"/.test(mainBox[1]) && /id="danger-band"/.test(mainBox[1]),
  'NO .danger-main — the score and its band will be split across the chip')
const mainRule = lastRule(/^\s*\.danger-main\s*$/, 'display')
check('.danger-main is a flex row so the pair centres as a unit',
  Boolean(mainRule) && /display:\s*flex/.test(mainRule.body),
  mainRule ? `found: ${mainRule.body.match(/display:[^;]*/)}` : 'NO RULE')

// ── 8. The phone rows are tall enough for the touch targets in them ───────
// Every control below 1100px is given `--ctl-h-touch: 44px` for WCAG 2.5.5.
// The grid rows were hard-coded to 32px, so those 44px targets overlapped
// each other by 6px — the language toggle sat 6px into the mode toggle, and
// at ≤480 the header's own box was 2px shorter than its content under an
// `overflow: hidden`. A 44px touch target that collides with its neighbour
// is not a 44px touch target.
const phoneRows = [...css.matchAll(/grid-template-rows:\s*([^;]+);/g)]
  .map((m) => m[1].split(/\s+/).map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n)))
  .filter((r) => r.length === 3 && r.every((v) => v <= 64))
const shortRows = phoneRows.filter((r) => r.some((v) => v > 0 && v < 44))
check('every phone grid row is at least the 44px touch target',
  phoneRows.length > 0 && shortRows.length === 0,
  `rows shorter than 44px: ${shortRows.map((r) => r.join('/')).join('  ')}`)
// The wrappers must not re-impose the old fixed height on top of the rows.
const toggleHeights = [...css.matchAll(/#(?:mode|lang)toggle\s*\{([^}]*)\}/g)]
  .map((m) => m[1].match(/height:\s*(\d+)px/)?.[1])
  .filter(Boolean)
  .map(Number)
check('no toggle wrapper re-imposes a fixed height under the touch targets',
  !toggleHeights.includes(32),
  `fixed heights found: ${toggleHeights.join(', ')} — a 32px wrapper puts its 44px buttons back into the row below`)

// ── 9. The headline verb is not starved by the line beneath it ─────────────
// `.national` is a flex row of plate / label / secondary. With both label and
// secondary shrinkable, flexbox split the deficit and at 1920 and 1700 the
// headline was left 84px of the 124px it needs, so "ติดตามสถานการณ์" rendered
// truncated. The secondary line is allowed to ellipsize; the headline is not.
const labelRule = lastRule(/^\s*\.national \.label\s*$/, 'flex')
check('.national .label does not shrink (the headline keeps its full width)',
  Boolean(labelRule) && /flex:\s*0 0 auto/.test(labelRule.body),
  labelRule ? `found: ${labelRule.body.match(/flex:[^;]*/)}` : 'NO RULE')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
