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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
