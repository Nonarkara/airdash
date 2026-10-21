// A class name may not mean two different things.
//
// WHY THIS GUARD EXISTS
// `.citizen-pin` was the name of BOTH the 24×24 round map marker in
// layers/citizen.js AND the row in the citizen panel head that holds the
// pin icon, the province name and the change button. The map marker's rule
// came later in the stylesheet, so it won: the head's row collapsed into a
// 24px circle, the province name spilled to x=-3 and was clipped by the edge
// of a phone screen, and the pin icon sat on a row of its own.
//
// The general rule is too noisy to enforce (a class legitimately appears in
// several files and several media queries). The PRECISE rule is this: a class
// that gives an element a FIXED WIDTH AND A HEIGHT is asserting a box, so it
// can only ever be one widget. If the frontend uses such a class in two
// different modules, the two usages must be the same widget — otherwise one
// of them has been silently resized into the other.
//
// Six candidates were found when this was written. Five are the same widget
// in two places and are allowed by name below, with the reason. One was a
// real collision and was fixed by renaming.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CSS_DIR = join(ROOT, 'public/css')
const JS_DIR = join(ROOT, 'public/js')

/** Classes that are deliberately one widget used in two places. */
const ALLOWED = {
  badge: 'the same severity chip in feeds, detail and search',
  'cctv-sampled-frame': 'the same <img> of a sampled camera frame',
  'citizen-loading-dot': 'the same loading dots in the citizen panel and its life panel',
  pip: 'the same LIVE dot; its two rules are scoped to different containers',
  sw: 'the same colour swatch in the layer control',
}

const walk = dir => {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.css') || p.endsWith('.js')) out.push(p)
  }
  return out
}

// ── classes that carry a fixed box ─────────────────────────────────────────
const sized = new Map()
for (const file of walk(CSS_DIR)) {
  if (!file.endsWith('.css')) continue
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m
    if (sel.includes('@') || sel.includes(':')) continue
    if (!/(?<!-)width\s*:/.test(body) || !/(?<!-)height\s*:/.test(body)) continue
    for (const c of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) {
      if (!sized.has(c[1])) sized.set(c[1], [])
      sized.get(c[1]).push(relative(ROOT, file))
    }
  }
}

// ── which module uses which class ──────────────────────────────────────────
const used = new Map()
for (const file of walk(JS_DIR)) {
  if (!file.endsWith('.js')) continue
  const src = readFileSync(file, 'utf8')
  const mod = relative(JS_DIR, file)
  const found = new Set()
  for (const m of src.matchAll(/class\s*[:=]\s*[`'"]([^`'"]*)[`'"]/g)) {
    for (const c of m[1].matchAll(/[A-Za-z][\w-]*/g)) found.add(c[0])
  }
  for (const c of found) {
    if (!used.has(c)) used.set(c, new Set())
    used.get(c).add(mod)
  }
}

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

const collisions = []
for (const [cls, mods] of used) {
  if (mods.size < 2 || !sized.has(cls)) continue
  if (ALLOWED[cls]) continue
  collisions.push({ cls, mods: [...mods].sort(), css: [...new Set(sized.get(cls))] })
}

check('no fixed-box class is used for two different widgets', collisions.length === 0,
  collisions.map(c => `.${c.cls} (${c.mods.join(', ')})`).join('; '))

for (const [cls, why] of Object.entries(ALLOWED)) {
  check(`.${cls} is allowed — ${why}`, used.get(cls)?.size >= 2 && sized.has(cls))
}

// The collision that started this must stay fixed.
const citizenPanels = readFileSync(join(JS_DIR, 'panels/citizen.js'), 'utf8')
check("the citizen head's place row no longer claims the map marker's class name",
  !/class:\s*['"]citizen-pin['"]/.test(citizenPanels) && /citizen-place-row/.test(citizenPanels),
  'the head row and the 24×24 map marker must not share a class name')
const layersCitizen = readFileSync(join(JS_DIR, 'layers/citizen.js'), 'utf8')
check('the map marker still uses its own class', /citizen-pin/.test(layersCitizen))

const css = readFileSync(join(CSS_DIR, 'components.css'), 'utf8')
check('the place row is a flex row again',
  /\.citizen-place-row\s*\{[^}]*display:\s*flex/.test(css) && /\.citizen-place-row\s*\{[^}]*align-items:\s*center/.test(css))
check('the map marker keeps its fixed 24px box',
  /\.citizen-pin\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/.test(css))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
