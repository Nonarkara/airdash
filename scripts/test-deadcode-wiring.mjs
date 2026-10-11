// Two features in this codebase were 90% built and never switched on.
//
// 1. RECENT PLACES (public/js/panels/search.js). The panel renders a RECENT
//    strip, reads it out of localStorage, has an empty state that promises
//    "recent opens appear here after your first search" — and never wrote a
//    single entry, because rememberRecent() had no caller. Every visitor saw
//    the empty state forever. The one line that fixes it lives in
//    selectResult(), which is the single funnel every path into a place goes
//    through (search hit, recent button, ?city= boot, saved-city boot).
//
// 2. SHARE BUTTON FEEDBACK (public/js/share.js). shareFeedback() existed and
//    was correct, so citizen.js inlined a partial copy of it that handled
//    only 'copied', never showed a failure, and hardcoded a Thai label. The
//    helper had no edge into it — a correct implementation that nothing can
//    reach is not a feature.
//
// WHY THE BEHAVIOUR IS EXECUTED AND THE WIRING IS NOT. rememberRecent and
// loadRecentPlaces are module-private and search.js pulls in state/i18n/cache,
// which touch `document` at import time — so the module cannot be imported in
// node. Instead we lift those two function bodies out of the source and run
// them against a stub preference layer. That way the dedup rule, the cap and
// the ordering are genuinely executed, not pattern-matched. The wiring itself
// (is rememberRecent called from selectResult?) can only be asserted on the
// source, because proving it by running would require the whole DOM.
//
// Run: node scripts/test-deadcode-wiring.mjs

import { readFileSync } from 'node:fs'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const searchSrc = readFileSync(new URL('../public/js/panels/search.js', import.meta.url), 'utf8')
const citizenSrc = readFileSync(new URL('../public/js/panels/citizen.js', import.meta.url), 'utf8')
const shareSrc = readFileSync(new URL('../public/js/share.js', import.meta.url), 'utf8')

// ── Lift a top-level function out of a module ─────────────────────────────
// The body brace is found by first matching the parameter list, NOT by
// indexOf('{') — a parameter default like `labels = {}` contains a brace and
// an indexOf search starts counting inside the signature, silently returning a
// truncated "body" that fails every assertion in a way that looks like a
// product bug. Braces inside the lifted bodies (template literals, object
// literals) are themselves balanced, so counting from the real body brace is
// enough.
function extractBody(src, name) {
  const m = new RegExp(`^(export )?(async )?function ${name}\\s*\\(`, 'm').exec(src)
  if (!m) return null
  let i = m.index + m[0].length
  let parens = 1
  while (i < src.length && parens > 0) {
    if (src[i] === '(') parens += 1
    else if (src[i] === ')') parens -= 1
    i += 1
  }
  while (i < src.length && /\s/.test(src[i])) i += 1
  if (src[i] !== '{') return null
  let depth = 0
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(m.index, j + 1)
    }
  }
  return null
}

// ── 1. WIRING: the calls that were missing ─────────────────────────────────

const selectResult = extractBody(searchSrc, 'selectResult')
check('selectResult() exists in search.js', selectResult !== null)
check('selectResult() records the open (rememberRecent is called from it)',
  selectResult !== null && /\brememberRecent\s*\(/.test(selectResult),
  'rememberRecent must be called from inside selectResult() — that is the one funnel every place-open goes through')

check('rememberRecent() is defined', extractBody(searchSrc, 'rememberRecent') !== null)
check('the RECENT strip reader still exists (showRecentPlaces)',
  extractBody(searchSrc, 'showRecentPlaces') !== null,
  'if the reader is gone the recorder has nothing to feed')

// Every path that opens a place must funnel through selectResult, otherwise a
// recorded entry is missing for that path. Count the call sites: a regression
// that adds a second, bypassing entry point has to show up here.
const callSites = [...searchSrc.matchAll(/(?<![a-zA-Z_])selectResult\s*\(/g)]
const fnDef = /function selectResult\s*\(/.test(searchSrc)
check('all place-open paths funnel through selectResult()',
  callSites.length - (fnDef ? 1 : 0) >= 3,
  `found ${callSites.length - (fnDef ? 1 : 0)} call sites; expected the search hit, recent button, ?city= boot and saved-city boot`)

// ── 2. SHARE FEEDBACK: the helper that had no edge into it ────────────────

check('citizen.js imports shareFeedback',
  /import\s*\{[^}]*\bshareFeedback\b[^}]*\}\s*from\s*'\.\.\/share\.js/.test(citizenSrc))
check('citizen.js calls shareFeedback(...)',
  /(?<![a-zA-Z_])shareFeedback\s*\(/.test(citizenSrc))
check('citizen.js no longer inlines the partial copied-only flash',
  !/if\s*\(\s*state\s*===\s*'copied'\s*\)/.test(citizenSrc),
  'an inline copied-only copy is what left shareFeedback orphaned in the first place')
check('citizen.js passes bilingual labels to shareFeedback',
  /shareFeedback\s*\([^)]*copied\s*:\s*tr\(/.test(citizenSrc),
  'shareFeedback defaults to Thai labels; the panel is bilingual so the caller must supply tr() strings')

const shareFeedback = extractBody(shareSrc, 'shareFeedback')
check('shareFeedback() exists', shareFeedback !== null)
check("shareFeedback reports failure ('failed' branch present)",
  shareFeedback !== null && /failed/.test(shareFeedback),
  'a failed copy that leaves the button untouched misreports what happened')
check("shareFeedback stays silent on 'cancelled'",
  shareFeedback !== null && /'cancelled'/.test(shareFeedback))
check('shareFeedback disables the button while flashing',
  shareFeedback !== null && /disabled\s*=\s*true/.test(shareFeedback))
check('shareFeedback restores the original label afterwards',
  shareFeedback !== null && /textContent\s*=\s*original/.test(shareFeedback))

// ── 3. BEHAVIOUR: run the lifted recorder against a stub preference layer ──

const RECENT_MAX = Number(/const RECENT_MAX = (\d+)/.exec(searchSrc)?.[1])
const RECENT_KEY = /const RECENT_KEY = '([^']+)'/.exec(searchSrc)?.[1]
check('RECENT_MAX is readable from source', Number.isInteger(RECENT_MAX) && RECENT_MAX > 0)
check('RECENT_KEY is readable from source', typeof RECENT_KEY === 'string' && RECENT_KEY.length > 0)

const rememberSrc = extractBody(searchSrc, 'rememberRecent')
const loadSrc = extractBody(searchSrc, 'loadRecentPlaces')

// Stub preference layer standing in for preferences.js.
const pref = new Map()
const readPreference = (k) => (pref.has(k) ? pref.get(k) : null)
const writePreference = (k, v) => { pref.set(k, v) }

let run = null
try {
  const factory = new Function(
    'readPreference', 'writePreference', 'RECENT_KEY', 'RECENT_MAX',
    `${rememberSrc}\n${loadSrc}\nreturn { rememberRecent, loadRecentPlaces }`,
  )
  run = factory(readPreference, writePreference, RECENT_KEY, RECENT_MAX)
} catch (e) {
  console.log(`FAIL could not lift rememberRecent/loadRecentPlaces — ${e.message}`)
  fail += 1
}

if (run) {
  const place = (n, extra = {}) => ({ type: 'city', name_th: n, name_en: `${n}-en`, lat: 10 + n.length, lng: 100 + n.length, zoom: 11, ...extra })

  // A guard that has been deleted should surface as one FAIL, not as an
  // unhandled exception that kills the run and hides every later check.
  const safe = (fn) => { try { fn(); return true } catch (e) { console.log(`  (threw: ${e.message})`); return false } }

  safe(() => run.rememberRecent(place('Sukhothai')))
  check('opening a place records it', run.loadRecentPlaces().length === 1,
    `got ${run.loadRecentPlaces().length}`)

  safe(() => run.rememberRecent(place('Sukhothai')))
  check('re-opening the same place does not duplicate it', run.loadRecentPlaces().length === 1,
    `got ${run.loadRecentPlaces().length}`)

  safe(() => run.rememberRecent(place('Chiang Mai')))
  check('a different place is appended', run.loadRecentPlaces().length === 2)
  check('the most recent open is first',
    run.loadRecentPlaces()[0].name_th === 'Chiang Mai',
    `got ${run.loadRecentPlaces()[0]?.name_th}`)

  for (let i = 0; i < 12; i += 1) safe(() => run.rememberRecent(place(`P${i}`)))
  check(`the list is capped at RECENT_MAX (${RECENT_MAX})`, run.loadRecentPlaces().length === RECENT_MAX,
    `got ${run.loadRecentPlaces().length}`)

  safe(() => run.rememberRecent({ name_th: 'nowhere', name_en: 'nowhere' }))
  const afterNoCoords = run.loadRecentPlaces().length
  check('an entry with no coordinates is not recorded', afterNoCoords === RECENT_MAX,
    `got ${afterNoCoords}`)

  safe(() => run.rememberRecent({ lat: 1, lng: 2 }))
  check('an entry with no name is not recorded', run.loadRecentPlaces().length === RECENT_MAX)

  const nullOk = safe(() => run.rememberRecent(null))
  check('a null entry is not recorded', nullOk && run.loadRecentPlaces().length === RECENT_MAX)

  // Private-mode safety: the write must not throw out of the click handler.
  // Both functions are needed — rememberRecent calls loadRecentPlaces, and a
  // lift that omits it would fail with a ReferenceError that looks like a
  // product defect rather than a broken harness.
  const boom = new Function(
    'readPreference', 'writePreference', 'RECENT_KEY', 'RECENT_MAX',
    `${rememberSrc}\n${loadSrc}\nreturn rememberRecent`,
  )(() => null, () => { throw new Error('QuotaExceededError') }, RECENT_KEY, RECENT_MAX)
  let threw = false
  try { boom(place('Bangkok')) } catch { threw = true }
  check('a failing preference layer does not throw out of the click', threw === false)

  check('the stored record is slim (no heavy payload carried)',
    run.loadRecentPlaces()[0] && !('payload' in run.loadRecentPlaces()[0]))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)