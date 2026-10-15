// Does the deploy guard actually catch an undocumented release?
//
// The guard's job: Cloudflare caches /js/* and /css/* for 7 days per URL, so a
// shipped asset change must move the ?v= token or the edge never sees it. A
// second guard sits on top: the CHANGELOG must document a release carrying that
// token, because three releases (2.4.67, 2.4.69, 2.4.72) shipped with assets
// and no release note.
//
// That second guard had a false pass. It accepted ANY heading matching the
// token, and on 2026-10-14 the CHANGELOG used "## [2.4.75]" for the R2 cost
// guard — an ops-only release whose own body says "asset token stays at
// 2.4.74". So a real 2.4.75 ASSET deploy passed the guard on the strength of a
// heading describing different work and explicitly disclaiming the token. The
// check went green; nothing was documented.
//
// The fix reads each candidate section's body and rejects one that disclaims a
// DIFFERENT token. This runs the real script against fixture changelogs, since
// a guard tested against a copy of itself proves nothing.
//
// Run: node scripts/test-check-bump-docs.mjs

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, 'check-bump.mjs')
const dir = mkdtempSync(join(tmpdir(), 'checkbump-'))

/** Run the real guard with a given token + changelog. Returns exit code. */
function guard(token, changelog) {
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog)
  // The guard reads public/js/boot.js for the token and walks public/js +
  // public/css to hash the assets, so the fixture needs that whole shape —
  // otherwise it exits non-zero for the wrong reason and every "should pass"
  // case fails for a reason that has nothing to do with documentation.
  mkdirSync(join(dir, 'public', 'js'), { recursive: true })
  mkdirSync(join(dir, 'public', 'css'), { recursive: true })
  writeFileSync(join(dir, 'public', 'js', 'boot.js'), `await import('/js/main.js?v=${token}')`)
  writeFileSync(join(dir, 'public', 'js', 'main.js'), '// fixture\n')
  writeFileSync(join(dir, 'public', 'css', 'tokens.css'), '/* fixture */\n')
  try {
    execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
}

const HEAD = '# Changelog\n\nAll notable changes to AirDash.\n\n'

// ── A documented release passes ──────────────────────────────────────────
check('a release headed by the token passes',
  guard('2.4.82', `${HEAD}## [2.4.82] — 2026-10-15 — the page answers the question it was opened with\n\nFrontend only.\n`) === 0)

check('a release headed by a product version that NAMES the token passes (older convention)',
  guard('2.4.33', `${HEAD}## [3.3.1] — 2026-09-20 · token 2.4.33\n\nFrontend only.\n`) === 0)

// ── The false pass that shipped ──────────────────────────────────────────
const OPS_ENTRY = `${HEAD}## [2.4.75] — 2026-10-11 — the R2 cost guard was watching a bucket that already held 159 MB\n\nOps-only; no file under \`public/\` changed, so the asset token stays at 2.4.74.\n\n- The guard could not fire.\n`
check('a heading that DISCLAIMS carrying the token does NOT count as documentation',
  guard('2.4.75', OPS_ENTRY) !== 0,
  'this is the exact false pass: a heading for different work stood in for a release note')

check('a disclaiming entry does not rescue a token that is documented elsewhere only by an older heading',
  guard('2.4.75', `${HEAD}## [3.3.1] — 2026-09-20 · token 2.4.33\n\nOlder release.\n\n${OPS_ENTRY}`) !== 0)

// ── Genuinely undocumented still fails ───────────────────────────────────
check('a token with no entry at all fails',
  guard('2.4.99', `${HEAD}## [2.4.82] — 2026-10-15 — something else\n`) !== 0)
check('an empty changelog fails',
  guard('2.4.82', HEAD) !== 0)

// ── A genuine entry alongside a disclaimed one still passes ─────────────
// The other convention is allowed to document this release even though an
// unrelated ops entry happens to share the token number.
check('an entry that genuinely carries the token passes even beside a disclaimed one',
  guard('2.4.75', `${HEAD}## [2.4.75] — 2026-10-11 — ops-only, token stays at 2.4.74\n\n- x\n\n## [3.4.0] — 2026-10-14 · token 2.4.75\n\n- the real 2.4.75 asset release\n`) === 0)

// ── A self-referential entry must not fool it ────────────────────────────
check('an entry that MENTIONS another token while claiming this one still passes',
  guard('2.4.82', `${HEAD}## [2.4.82] — 2026-10-15 — release\n\nSupersedes 2.4.74, which stayed at 2.4.73.\n`) === 0)

rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)