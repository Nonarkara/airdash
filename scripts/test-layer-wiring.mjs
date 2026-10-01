// Every layer toggle must have a layer behind it.
//
// THE BUG THIS EXISTS FOR
// map.js used to wire satellite layers one line at a time
// (`layers.omiAod = satLayers.omiAod`). Eight of the nineteen layers the
// factory builds were never written down, so their toggles appeared in the
// menu, accepted a click, and did nothing — toggleLayer() resolves
// `layers[t.id]` and returns early on undefined. Eight dead controls, and the
// symptom users report is "some layers don't appear".
//
// map.js now derives the wiring from LAYER_GROUPS in one loop, so the
// invariant is simply: a satellite toggle must exist in the factory, and a
// non-satellite toggle must be assigned in map.js. This asserts both, plus
// the property that would have caught it from the other direction — a layer
// that is built but can never be reached.

import { readFileSync } from 'node:fs'
import { LAYER_GROUPS } from '../public/js/layers/satellite.js'

const root = new URL('../', import.meta.url)
const mapSrc = readFileSync(new URL('public/js/map.js', root), 'utf8')
const satSrc = readFileSync(new URL('public/js/layers/satellite.js', root), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// Keys the satellite factory actually returns.
const factory = satSrc.match(/return \{([\s\S]*?)\n  \}\n\}/)
const built = new Set(factory ? [...factory[1].matchAll(/^\s{4}([a-zA-Z0-9_]+):/gm)].map((m) => m[1]) : [])

const toggles = LAYER_GROUPS.flatMap((g) => g.layers)
const sat = toggles.filter((t) => t.kind === 'sat')
const other = toggles.filter((t) => t.kind !== 'sat')

console.log(`\n── satellite toggles: ${sat.length} of ${built.size} factory layers ──`)
check('map.js wires satellite layers from LAYER_GROUPS, not line by line',
  /for \(const t of allLayerToggles\(\)\)[\s\S]{0,200}?layers\[t\.id\] = satLayers\[t\.id\]/.test(mapSrc),
  'the per-line assignment is what allowed the drift in the first place')
for (const t of sat) {
  check(`${t.id} exists in the satellite factory`, built.has(t.id),
    'a toggle for a layer that is never built can never appear')
}

console.log(`\n── non-satellite toggles: ${other.length} ──`)
const assigned = new Set([...mapSrc.matchAll(/\blayers\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1]))
for (const t of other) {
  check(`${t.id} is assigned into the map's layers object`, assigned.has(t.id))
}

console.log('\n── no layer is built and unreachable ──')
const satIds = new Set(sat.map((t) => t.id))
const unreached = [...built].filter((b) => !satIds.has(b))
check('every factory layer has a toggle in the menu', unreached.length === 0,
  `unreachable: ${unreached.join(', ')}`)

console.log('\n── the toggle list is not empty and not duplicated ──')
const ids = toggles.map((t) => t.id)
check(`${ids.length} toggles across ${LAYER_GROUPS.length} groups`, ids.length > 20)
check('no duplicate toggle ids', new Set(ids).size === ids.length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
