// Contrast is a number, so it gets a test.
//
// WHY THIS IS A TEST AND NOT A COMMENT
// The tertiary ink token sat at 3.16:1 on the light paper for long enough
// that it read as "obviously fine" to everyone looking at it. It is the colour
// of source attribution and of the no-data score — text a reader actually has
// to parse. WCAG SC 1.4.3 wants 4.5:1 and it was failing in BOTH themes
// (3.16 light, 4.36 dark). Nothing in the test suite noticed, because nothing
// in the test suite computed a contrast ratio.
//
// The band colours had the same problem in a form that is easy to miss by eye:
// #F0B400 (the "watch" band) measured 1.75:1 on the light paper — the default
// theme — and #A51931 ("high") measured 2.32:1 on dark, which is to say the
// band a viewer must notice most was the least visible thing on screen.
//
// This recomputes both from the real token values on every run, so a future
// palette edit that breaks legibility fails the build instead of shipping.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'public/css/tokens.css'), 'utf8')
const i18n = readFileSync(join(ROOT, 'public/js/i18n.js'), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// ── WCAG contrast maths ─────────────────────────────────────────────────────
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** All values of a CSS custom property; the dark theme redefines them. */
function tokenValues(name) {
  return [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`, 'g'))].map((m) => m[1])
}
const paper = (theme) => tokenValues('paper')[theme === 'light' ? 0 : 1]
const inkLow = (theme) => tokenValues('ink-low')[theme === 'light' ? 0 : tokenValues('ink-low').length - 1]

const AA = 4.5 // SC 1.4.3, normal text
const UI = 3.0 // SC 1.4.11, non-text UI components and graphical objects

console.log('\n── --ink-low is body text, so it needs 4.5:1 (SC 1.4.3) ──')
for (const theme of ['light', 'dark']) {
  const fg = inkLow(theme), bg = paper(theme)
  const r = ratio(fg, bg)
  check(`${theme} theme: ${fg} on ${bg} = ${r.toFixed(2)}:1`,
    r >= AA, `below the 4.5:1 minimum for normal-size text`)
}

console.log('\n── band + PM marks are UI graphics, so they need 3:1 (SC 1.4.11) ──')
// Read them back out of the module rather than restating them here, so this
// test fails if someone edits i18n.js and does not come back to check.
const block = i18n.match(/export const BAND_COLORS = \{[\s\S]*?\n\}/)?.[0] ?? ''
const sets = {}
for (const m of block.matchAll(/(light|dark):\s*\{([^}]*)\}/g)) {
  sets[m[1]] = Object.fromEntries([...m[2].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map((x) => [x[1], x[2]]))
}
check('BAND_COLORS exposes both themes', !!sets.light && !!sets.dark)

for (const theme of ['light', 'dark']) {
  const bg = paper(theme)
  for (const [band, hex] of Object.entries(sets[theme] ?? {})) {
    const r = ratio(hex, bg)
    check(`${theme} band "${band}" ${hex} on ${bg} = ${r.toFixed(2)}:1`, r >= UI,
      `below the 3:1 minimum for a non-text mark`)
  }
}

console.log('\n── the failure this test exists to prevent is really fixed ──')
{
  // Guard against someone "fixing" the test by relaxing it, which is the same
  // mistake as loosening a slug guard: it passes and the defect ships.
  check('the old failing amber is not back as the light-theme watch band',
    sets.light?.watch !== '#F0B400',
    `#F0B400 measured 1.75:1 on the light paper`)
  check('the old failing red is not back as the light-theme high band',
    sets.light?.high !== '#7A1F2B')
  check('light and dark themes differ where they must',
    JSON.stringify(sets.light) !== JSON.stringify(sets.dark),
    'a single hex cannot clear 3:1 against both papers')
}

console.log('\n── the band table is defined once, not copied per file ──')
{
  // The literal used to be duplicated verbatim in paint.js,
  // layers/osm-buildings.js, layers/province-boundaries.js and
  // panels/search.js. "Fix one, leave three" is how the map layers ended up
  // disagreeing with each other about what a band looks like.
  const files = [
    'public/js/paint.js', 'public/js/layers/osm-buildings.js',
    'public/js/layers/province-boundaries.js', 'public/js/panels/search.js',
  ]
  // Matched on an OPAQUE band entry (`normal: '#00933C'`) specifically. A
  // low-opacity choropleth fill (`normal: { fill: '#00933C', opacity: 0.04 }`)
  // is a different thing: it tints a region at 4-22% alpha, where a 3:1
  // contrast requirement would be meaningless, and the band is carried by the
  // outline beside it. Flagging that as a duplicate would be a false positive
  // that teaches everyone to ignore this test.
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    const hardcoded = /normal:\s*'#[0-9A-Fa-f]{6}'/.test(src)
    check(`${f} does not carry its own opaque copy of the band table`, !hardcoded)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
