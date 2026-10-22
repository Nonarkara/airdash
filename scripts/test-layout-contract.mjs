// Shape contracts: what things on screen are allowed to look like.
//
// WHY THIS GUARD EXISTS
// Three defects of the same family were found by looking at the rendered
// page, not by reading the code, and each one is invisible to a data test:
//
//   1. The map's wind arrows were a 44px white badge per province — the same
//      badge shape as the province risk markers. Seventy of them blanketed
//      the map, piled up in the north, and buried the PM2.5 circles, which
//      are the map's primary reading.
//   2. They were drawn in the 'vectors' pane (350) while the province
//      markers were in 'data' (450), so most of the field was hidden behind
//      the very data it was annotating.
//   3. Eleven tabs in a six-column rail left the twelfth cell of the second
//      row empty: a hole in the navigation, because the grid was sized for
//      twelve items rather than the eleven there are.
//
// A guard that only checks the numbers would pass all three.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const css = read('public/css/components.css')
const mapJs = read('public/js/map.js')
const satJs = read('public/js/layers/satellite.js')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the wind field is a field, not seventy badges ─────────────────────────
// "No badge" means every one of these declarations resolves to nothing
// visible. Asserting the *absence* of a property name is not enough: a
// rule that says `box-shadow: none` still carries the property, and a
// naive /box-shadow/ test would read that as a badge. So each declaration
// is read and its VALUE is judged.
const windIcon = css.match(/\.haze-wind-icon\s*\{([^}]*)\}/)?.[1] ?? ''
const decl = (block, prop) => block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.trim().toLowerCase()
  ?? null
const INVISIBLE = new Set(['none', 'transparent', '0', '0 0', 'unset', 'initial', 'inherit'])
const isInvisible = v => v === null || INVISIBLE.has(v) || /^0(px|em|rem)?\b/.test(v)

check('the wind arrow carries no badge of its own',
  isInvisible(decl(windIcon, 'background'))
    && isInvisible(decl(windIcon, 'border'))
    && isInvisible(decl(windIcon, 'border-width'))
    && isInvisible(decl(windIcon, 'box-shadow')),
  `a badge per province blankets the map: ${windIcon.trim()}`)
check('the wind arrow is small enough to sit inside a province marker',
  /width:\s*1[0-9]px/.test(css.match(/\.haze-wind-icon \.wind-arrow\s*\{([^}]*)\}/)?.[1] ?? ''),
  'a 30px arrow inside a 24px marker is not a mark, it is a lid')

// ── the field is drawn above the data it annotates ────────────────────────
const panes = [...satJs.matchAll(/\['(\w+)',\s*(\d+)\]/g)].map(m => [m[1], Number(m[2])])
const z = Object.fromEntries(panes)
check('the map declares a pane for the wind field', z.windfield !== undefined, `panes: ${Object.keys(z).join(',')}`)
check('the wind field is drawn ABOVE the province data it annotates',
  z.windfield !== undefined && z.data !== undefined && z.windfield > z.data,
  `windfield ${z.windfield} must be above data ${z.data}, or the markers hide the arrows`)
check('the wind arrows are placed in that pane', /pane:\s*'windfield'/.test(mapJs))

// ── the navigation fills the row it is given ─────────────────────────────
const tabsGrid = css.match(/\.tabs\s*\{([^}]*)\}/)?.[1] ?? ''
const cols = Number(tabsGrid.match(/repeat\((\d+)/)?.[1] ?? 0)
const tabCount = (read('public/ops.html').match(/id="tab-[a-z]+"/g) ?? []).length
check('the tab strip knows how many tabs it holds', cols > 0 && tabCount > 0, `cols=${cols} tabs=${tabCount}`)
check('the last tab spans the cells the row would otherwise leave empty',
  /\.tabs button:nth-child\(11\):last-child\s*\{\s*grid-column:\s*span 2/.test(css),
  `${tabCount} tabs in ${cols} columns leaves a hole unless the last one spans`)
check('the spanning rule targets the real last tab',
  tabCount === 11, `the rule names the 11th tab; there are ${tabCount}`)

// ── the legend explains the mark it shows ─────────────────────────────────
check('the map legend explains the wind arrow',
  /PROVINCE WIND|ทิศลมรายจังหวัด/.test(mapJs) && /arrow points where the air moves/.test(mapJs),
  'a mark with no key is a mark nobody can read')

// ── the ranking panel: one heading, and every block earns its height ─────
// Measured on a 390px phone before this pass, the first province row sat
// 313px down (37% of the screen): an eyebrow that repeated the title
// verbatim, a two-box action card whose task-relevant line was the one in
// dashes, and a caption whose unit belonged to a column. Each was
// individually reasonable and together they pushed the data off the screen.
const opsHtml = read('public/ops.html')
const rankingJs = read('public/js/panels/ranking.js')

const panelHeadHtml = opsHtml.match(/<div class="panel-head">([\s\S]*?)<\/div>\s*<div class="scroll"/)?.[1] ?? ''
check('the ranking panel head has ONE heading, not two',
  !/<div class="eyebrow"[^>]*>[^<]*จัดอันดับ/.test(panelHeadHtml),
  'an eyebrow repeating the title verbatim is a second heading for one idea')
check('the ranking panel head carries a LIVE tag instead',
  /class="live-tag"/.test(panelHeadHtml) && /data-i18n="สด\|LIVE"/.test(panelHeadHtml),
  'the tag carries the one thing the title cannot say: that it refreshes')

check('the mode note rides beside the mode switch, not above it',
  /\.rank-mode-block\s*\{[^}]*display:\s*flex/.test(css) && /\.rank-mode-note\s*\{[^}]*flex:\s*1/.test(css),
  'a note stacked above the switch costs a whole line of the opening screen')
check('the mode switch keeps its intrinsic width',
  /\.rank-mode-toggle \.rmt-btn\s*\{[^}]*flex:\s*1 1 auto/.test(css),
  'flex-basis 0 makes a shrink-to-fit switch size itself to zero and the labels wrap')

check('the unit sits on the column it measures',
  /class: 'unit'/.test(rankingJs) && /'PM2\.5', el\('small'/.test(rankingJs),
  'a unit in a caption above the table is 30px of the opening screen')
check('the caption no longer repeats the unit',
  !/PM2\.5: µg\/m³/.test(rankingJs),
  'the unit is on the column header; saying it twice is noise')
check('the phone caption is dropped — the hero carries that caveat',
  /@media \(max-width: 620px\)[\s\S]*?\.rank-method\s*\{\s*display:\s*none/.test(css),
  'on a phone the danger chip already says "not a clinical index"')
check('the phone action card is ONE block, not two bordered boxes',
  /@media \(max-width: 620px\)[\s\S]*?\.rnc-action\s*\{[^}]*border:\s*0[^}]*\}/.test(css),
  'one idea, two borders — and the task-relevant line was the dashed one')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
