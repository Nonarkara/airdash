// Reachability: a feature that nothing links to does not exist.
//
// THE BUGS THIS EXISTS FOR
//
// 1. public/js/layers/cctvWall.js was 152 lines of built, styled, working
//    UI — cards, a stream-staggering IntersectionObserver, an Escape
//    handler, a "the wet season is clean, so relax the threshold"
//    fallback — and NOBODY IMPORTED IT. Not main.js, not map.js, not the
//    header. The camera wall, /api/cctv/haze-eyes, and the whole
//    frame-grab + pixel-read pipeline behind it were reachable only by
//    typing a URL by hand. Every test suite was green, the API answered,
//    and the feature was absent from the product.
//
// 2. Eight satellite layer toggles rendered, took a click, and did
//    nothing (covered by test-layer-wiring.mjs).
//
// Both are the same failure and neither is caught by testing the thing
// that is broken — the wall's rendering was never wrong; its ABSENCE was.
// So this file tests the graph, not the code: every module under
// public/js/ must be reachable from an entry point, every entry point must
// exist in the HTML that ships, and the two custom events that bridge the
// map layer to the wall must each have a dispatcher AND a listener.
//
// The general rule: a correct implementation with no edge into it is not a
// feature, and a suite that only tests implementations will stay green
// while the product loses a surface.

import { readFileSync, readdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

const ops = read('public/ops.html')
const main = read('public/js/main.js')
const mapSrc = read('public/js/map.js')
const entry = read('public/js/cctvEntry.js')
const cctvLayer = read('public/js/layers/cctv.js')
const wall = read('public/js/layers/cctvWall.js')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// ── 1. The entry point exists in the shipped HTML ────────────────────────
check('ops.html carries #cctv-wall-btn', ops.includes('id="cctv-wall-btn"'))
check('the button is a real <button type="button">', /<button[^>]*id="cctv-wall-btn"[^>]*type="button"/.test(ops))
check('the button is inside the header', /<header>[\s\S]*cctv-wall-btn[\s\S]*<\/header>/.test(ops))
check('the button has an accessible label', ops.includes('data-i18n-title=') && /cctv-wall-btn[\s\S]{0,400}data-i18n-title=/.test(ops))

// ── 2. The button is actually wired to the wall ──────────────────────────
check('main.js imports initCctvWall', main.includes('initCctvWall'))
check('main.js calls it', /safeInit\('cctvWall',\s*initCctvWall\)/.test(main))
check('cctvEntry imports openHazeEyes from the wall', /import\s*\{[^}]*openHazeEyes[^}]*\}\s*from\s*'\.\/layers\/cctvWall\.js/.test(entry))
check('the click handler actually calls openHazeEyes', /openHazeEyes\s*\(/.test(entry))
check('cctvWall.js exports openHazeEyes', /export\s+(async\s+)?function\s+openHazeEyes/.test(wall))

// ── 3. The computer-vision readout is live, and honest ───────────────────
check('the button has a readout element', ops.includes('id="cv-readout"'))
check('the readout is fetched from /api/haze-vision', entry.includes('/api/haze-vision'))
check('the readout reports frames actually scored', /d\.scored/.test(entry))
check('the readout is not faked on failure (catch leaves it empty)',
  /catch\s*\{[\s\S]{0,400}?\}/.test(entry) && !/catch[\s\S]{0,200}textContent\s*=\s*['"`]0/.test(entry))

// ── 4. Both custom-event bridges have two ends ───────────────────────────
// An event with a dispatcher and no listener is the same bug as an orphan
// module: it looks wired and does nothing.
check('map.js LISTENS for airdash:locate-camera', mapSrc.includes("addEventListener('airdash:locate-camera'"))
check('cctvEntry DISPATCHES airdash:locate-camera', entry.includes("new CustomEvent('airdash:locate-camera'"))
check('cctv.js DISPATCHES airdash:open-haze-eyes', cctvLayer.includes("new CustomEvent('airdash:open-haze-eyes'"))
check('cctvEntry LISTENS for airdash:open-haze-eyes', entry.includes("addEventListener('airdash:open-haze-eyes'"))
check('the wall locate handler is actually passed to openHazeEyes', /openHazeEyes\(\{\s*onLocate\s*\}\)/.test(entry))

// ── 5. The map pin is a way IN, not a dead end ───────────────────────────
check('the camera popup offers the wall', cctvLayer.includes('cctv-pop-wall'))
check('the popup wall button is bound on popupopen', /popupopen[\s\S]{0,600}cctv-pop-wall/.test(cctvLayer))
const components = read('public/css/components.css')
check('the pin has a >=44px hit target', /\.cctv-pin::after[\s\S]{0,300}?44px\s*;\s*height:\s*44px/.test(components))

// ── 6. LOOK keys: server ↔ wall ↔ player must agree ──────────────────────
// The server sends snake_case keys (smoke_like) inside vision_summary; the
// player labels them kebab-case (smoke-like). A lookup that misses renders
// the FALLBACK label, and a fallback is indistinguishable from a real
// measurement — so a mismatch here would silently mislabel frames.
const orderBlock = wall.match(/const LOOK_ORDER = \[([\s\S]*?)\n\]/)?.[1] ?? ''
const orderKeys = [...orderBlock.matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1])
const orderLooks = [...orderBlock.matchAll(/look:\s*'([a-z-]+)'/g)].map((m) => m[1])
const player = read('public/js/layers/cctvPlayer.js')
const labelBlock = player.match(/export const LOOK_LABEL = \{([\s\S]*?)\n\}/)?.[1] ?? ''
const labelLooks = [...labelBlock.matchAll(/^\s*'?([a-z-]+)'?:\s*\{/gm)].map((m) => m[1])

check('LOOK_ORDER is non-empty', orderKeys.length > 0)
check('every LOOK_ORDER key is unique', new Set(orderKeys).size === orderKeys.length)
check('every LOOK_ORDER look has a LOOK_LABEL', orderLooks.every((l) => labelLooks.includes(l)),
  `looks: ${orderLooks.join(',')} | labels: ${labelLooks.join(',')}`)
check('LOOK_LABEL has no key the wall never reaches',
  labelLooks.every((l) => orderLooks.includes(l)),
  `orphan labels: ${labelLooks.filter((l) => !orderLooks.includes(l)).join(',')}`)
check('the smoke/fog looks map to the server snake_case keys',
  orderKeys.includes('smoke_like') && orderKeys.includes('fog_like'))

// Every look chip must be bilingual — a label that only exists in one
// language renders as a blank chip in the other.
const unlabeled = [...labelBlock.matchAll(/^\s*'?([a-z-]+)'?:\s*\{\s*th:\s*'([^']*)'\s*,\s*en:\s*'([^']*)'/gm)]
  .filter(([, , th, en]) => !th.trim() || !en.trim())
  .map((m) => m[1])
check('every LOOK_LABEL is bilingual', unlabeled.length === 0, `empty: ${unlabeled.join(',')}`)

// ── 7. No orphaned modules under public/js/ ──────────────────────────────
// The whole class of bug in one sweep: walk the import graph from the two
// real entry points and assert that every shipped module is reached.
function walk(dir, files = []) {
  for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    const rel = `${dir}${e.name}`
    if (e.isDirectory()) walk(`${rel}/`, files)
    else if (e.name.endsWith('.js')) files.push(rel)
  }
  return files
}
const allFiles = [
  ...walk('public/js/'),
]
const sources = new Map(allFiles.map((f) => [f, read(f)]))

function importsOf(file) {
  const src = sources.get(file) ?? ''
  return [...src.matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)]
    .map((m) => m[1] || m[2])
    .filter(Boolean)
}
// Resolve a relative spec against the importing file's directory, WITHOUT
// URL semantics: `new URL('./x.js', 'file://public/js/a.js')` resolves
// against the host root and yields /js/x.js, which matches nothing and
// reports every module as an orphan — a failing test that says nothing
// about the product.
function resolve(spec, from) {
  if (!spec.startsWith('.')) return null
  // Every import in this project carries a `?v=2.4.45` cache token, so the
  // spec is './state.js?v=2.4.45' while the key on disk is 'public/js/
  // state.js'. Without stripping it, main.js has zero resolvable imports
  // and the whole tree reads as orphaned.
  const clean = spec.split('?')[0]
  const parts = from.split('/')
  parts.pop()
  for (const seg of clean.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  const base = parts.join('/')
  return sources.has(base) ? base : null
}

const seen = new Set()
const queue = ['public/js/main.js', 'public/js/boot.js', 'public/js/story.js']
while (queue.length) {
  const f = queue.pop()
  if (!f || seen.has(f) || !sources.has(f)) continue
  seen.add(f)
  for (const spec of importsOf(f)) {
    const r = resolve(spec, f)
    if (r && !seen.has(r)) queue.push(r)
  }
}
const orphans = allFiles.filter((f) => !seen.has(f))
check('every module under public/js is reachable from an entry point',
  orphans.length === 0,
  `orphaned (${orphans.length}): ${orphans.join(', ')}`)

// ── 8. Every header control in the HTML is wired ─────────────────────────
// The same failure one level up: a button in ops.html that no module
// references is a control that does nothing, which is how eight dead
// satellite toggles were reported as "some layers don't appear".
//
// Three legitimate ways to be wired WITHOUT naming the id in JS, so the
// check must not miss them — a test that fails on correct code is a test
// people learn to ignore:
//   · <a href>            navigates; there is nothing to wire
//   · type="submit"       fires its parent form's submit handler
//   · data-pane           the ARIA tabs pattern selects on dataset.pane
const controlTags = [...ops.matchAll(/<(button|a)\b([^>]*)>/g)]
  .map((m) => {
    const attrs = m[2]
    return {
      id: attrs.match(/\bid="([a-z0-9-]+)"/)?.[1],
      attrs,
    }
  })
  .filter((c) => c.id)
const front = [...seen].map((f) => sources.get(f)).join('\n')
const named = (id) => front.includes(`'${id}'`) || front.includes(`"${id}"`)
const unwired = controlTags.filter(({ id, attrs }) => {
  if (named(id)) return false
  if (/<a\b/.test(`<a ${attrs}>`) && /href="/.test(attrs)) return false  // navigation
  if (/type="submit"/.test(attrs)) return false                            // form submit
  if (/data-pane="/.test(attrs)) return false                              // ARIA tabs
  return true
}).map((c) => c.id)
check('every control in ops.html is wired by something',
  unwired.length === 0, `unwired: ${unwired.join(', ')}`)

// And the inverse, for the modules that paint the CHROME. This is the real
// hazard a header redesign creates: delete a control from ops.html and the
// module still calls getElementById on it, gets null, and the feature dies
// quietly inside main.js's safeInit(). That is precisely how the camera wall
// stayed unreachable — the surface was correct, only its edge was missing.
//
// Scoped to header.js and dataFreshness.js on purpose. Most other modules
// look up elements they create themselves at runtime (#place-card,
// #detail-chart, #citizen-persona-host), so "not in the static HTML" is
// normal for them and would make this assertion cry wolf.
const idsInOps = new Set(
  [...ops.matchAll(/\bid="([a-z0-9_-]+)"/g)].map((m) => m[1]),
)
const chromeFiles = ['public/js/panels/header.js', 'public/js/dataFreshness.js']
const missingChrome = new Set()
for (const f of chromeFiles) {
  for (const m of sources.get(f).matchAll(/getElementById\('([a-z0-9_-]+)'\)/g)) {
    if (!idsInOps.has(m[1])) missingChrome.add(`${f.replace('public/js/', '')} → #${m[1]}`)
  }
}
check('every chrome element the header looks up still exists in ops.html',
  missingChrome.size === 0, `absent from the HTML: ${[...missingChrome].join(', ')}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
