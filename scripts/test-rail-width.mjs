// The rail budget: a table's width comes from its content.
//
// WHY THIS GUARD EXISTS
// The left rail holds the province ranking — a name column plus four
// numbers. The name column is `minmax(0, 1fr)`, so it takes whatever the
// rail leaves after the four fixed tracks. At --rail-l: 300px that was
// 86px, which is less than "พระนครศรีอยุธยา" (106px) and less than half
// of "Phra Nakhon Si Ayutthaya" (165px). Three Thai names and fifteen
// English ones were cut off mid-word, Bangkok among them.
//
// The number that matters is a FONT METRIC — how wide the longest province
// name renders in the name column's own font. That cannot be typed by
// hand and trusted, so it is measured by a real browser and written to
// scripts/ops/rank-fit.json by scripts/ops/probe-first-screen.mjs.
//
// This guard combines that measurement with the CSS and asks two things:
//
//   1. Is every --rail-l in the ladder at least what the table needs?
//   2. Is the measurement still describing the CSS as it is now?
//
// The second question matters more than it looks. A guard that checks a
// measurement taken against different CSS is checking nothing: change the
// name font and the old numbers still "pass"; change a track width and the
// budget is silently wrong. So the artifact records the font and the
// tracks it was measured at, and any drift fails the guard rather than
// quietly validating it.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

const css = read('public/css/components.css')
const tokens = read('public/css/tokens.css')
const layout = read('public/css/layout.css')

// ── the CSS the budget is computed from ───────────────────────────────────
// `rule` takes a REGEX SOURCE, not a literal: the selectors here contain
// characters that have to be escaped exactly once.
//
// Declarations are read by STRIPPING COMMENTS FIRST and then splitting on
// ";". Matching a property with a regex like /(?:^|;)\s*prop:/ silently
// misses any declaration that follows a comment block — and a property
// that is missed reads as a track of zero pixels, which makes the budget
// smaller and the guard pass for the wrong reason.
const rule = src => {
  const m = css.match(new RegExp(src + '\\s*\\{([^}]*)\\}'))
  return m ? m[1] : ''
}
const decls = block => {
  const out = {}
  for (const part of block.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  return out
}

const tableDecls = decls(rule('\\.rank-summary,\\s*\\.rank-columns'))
const nameDecls = decls(rule('\\.rank-name\\b(?!-)'))

// Split a grid template on top-level spaces only — "minmax(0, 1fr)" is one
// track, not two. A naive split(" ") would see "1fr)" as a track and the
// budget would be computed from nonsense.
const splitTracks = t => {
  const out = []
  let depth = 0, cur = ''
  for (const ch of t) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ' ' && depth === 0) { if (cur) { out.push(cur); cur = '' } }
    else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

// "padding: 6px 10px" → top 6, right 10, bottom 6, left 10.
const padding4 = v => {
  const p = v.split(/\s+/).filter(Boolean).map(x => parseFloat(x) || 0)
  if (p.length === 1) return [p[0], p[0], p[0], p[0]]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  if (p.length === 3) return [p[0], p[1], p[2], p[1]]
  return [p[0], p[1], p[2], p[3]]
}

const template = tableDecls['grid-template-columns'] ?? ''
const tracks = splitTracks(template)
const gap = parseFloat(tableDecls['column-gap']) || 0
const pad = padding4(tableDecls['padding'] ?? '')
const padL = pad[3], padR = pad[1]
const nameFontSize = nameDecls['font-size'] ?? ''
const nameFontWeight = nameDecls['font-weight'] ?? ''
const rankFontFamily = decls(rule('#ranking'))['font-family'] ?? ''
const nameFontFamily = nameDecls['font-family'] ?? rankFontFamily
const normalizeFont = value => String(value).replace(/[\"']/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim()

const flexIdx = tracks.findIndex(t => /fr\b/.test(t))
const fixedTracks = tracks.filter((t, i) => i !== flexIdx).map(t => parseFloat(t) || 0)
const fixedSum = fixedTracks.reduce((a, b) => a + b, 0)
const rowBorder = parseFloat(decls(rule('\\.rank-row'))['border-left']) || 0
const scrollbar = parseFloat(tokens.match(/::\-webkit-scrollbar\s*\{[^}]*width:\s*([\d.]+)px/)?.[1] ?? '0')
check('the width budget includes the urgency stripe and scrollbar', rowBorder > 0 && scrollbar > 0)

// ── every --rail-l the layout can use ─────────────────────────────────────
const railValues = [
  ...[...tokens.matchAll(/--rail-l\s*:\s*(\d+(?:\.\d+)?)px/g)].map(m => ({ where: 'tokens.css', px: parseFloat(m[1]) })),
  ...[...layout.matchAll(/--rail-l\s*:\s*(\d+(?:\.\d+)?)px/g)].map(m => ({ where: 'layout.css', px: parseFloat(m[1]) })),
]

// ── the measurement ───────────────────────────────────────────────────────
const FIT = join(ROOT, 'scripts/ops/rank-fit.json')
const artifactExists = existsSync(FIT)
let fit = null
if (artifactExists) {
  try { fit = JSON.parse(read('scripts/ops/rank-fit.json')) } catch { fit = null }
}

check('the rail measurement exists', artifactExists && !!fit,
  artifactExists ? 'scripts/ops/rank-fit.json is not valid JSON' : 'run: node scripts/ops/probe-first-screen.mjs http://localhost:28341/ops.html 1440 900')
check('the measurement covers BOTH languages', !!fit && !!fit.th && !!fit.en,
  'a budget measured in Thai only proves the table fits in Thai — the English names are the long ones')

// Staleness: the measurement must still describe the CSS it was taken at.
if (fit?.th && fit?.en) {
  for (const lang of ['th', 'en']) {
    const measured = fit[lang]
    const measuredTracks = (measured.tracks || []).slice(1)
    check(`${lang}: all77 province names were measured`, measured.rows === 77)
    check(`${lang}: stripe and scrollbar costs match the measurement`, measured.rowBorder === rowBorder && measured.scrollbar <= scrollbar)
    const expectedFont = `${nameFontWeight} ${nameFontSize} ${nameFontFamily}`
    check(`${lang}: the measurement uses the current name font including family`,
      !!nameFontFamily && normalizeFont(measured.nameFont) === normalizeFont(expectedFont),
      `measured "${measured.nameFont}", CSS says "${expectedFont}" — re-run the probe`)
    check(`${lang}: the measurement uses the current fixed tracks`,
      measuredTracks.length === fixedTracks.length && measuredTracks.every((t, i) => Math.abs(t - fixedTracks[i]) <= 0.5),
      'fixed tracks changed — re-run the probe')
    check(`${lang}: the measurement uses the current gap and padding`,
      measured.gap === gap && measured.padL === padL && measured.padR === padR,
      'gap or padding changed — re-run the probe')
  }

  // The budget. The name column needs the wider of the two languages'
  // longest names, plus a little room so the next province on the list
  // does not instantly clip.
  const HEADROOM = 10
  const nameNeed = Math.max(fit.th.nameNeed || 0, fit.en.nameNeed || 0)
  const required = Math.ceil(nameNeed + HEADROOM + fixedSum + gap * (tracks.length - 1) + padL + padR + rowBorder + scrollbar)

  check('the name column is the flexible one',
    flexIdx === 0,
    `expected the name column to be the 1fr track, found it at index ${flexIdx} — the budget below assumes index 0`)

  check(`every --rail-l is at least the table's budget (${required}px)`,
    railValues.length > 0 && railValues.every(r => r.px >= required),
    railValues.filter(r => r.px < required).map(r => `${r.where} has ${r.px}px`).join('; '))

  check('no province name was cut in the measurement',
    fit.th.cut === 0 && fit.en.cut === 0,
    `th cut ${fit.th.cut} (${(fit.th.cutNames || []).join(', ')}) · en cut ${fit.en.cut} (${(fit.en.cutNames || []).join(', ')})`)

  console.log(`\nbudget: name ${nameNeed}px (+${HEADROOM}) + tracks ${fixedSum}px + gaps ${gap * (tracks.length - 1)}px + padding ${padL + padR}px + stripe ${rowBorder}px + scrollbar ${scrollbar}px = ${required}px`)
  console.log(`ladder: ${railValues.map(r => `${r.px}px`).join(', ')}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
