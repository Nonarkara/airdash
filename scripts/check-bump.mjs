// Deploy guard: shipped JS/CSS changed but the ?v= asset token did not.
//
// Cloudflare caches /js/* and /css/* for 7 days per URL. On 2026-09-27/28
// four deploys kept ?v=2.4.36, so the colo serving Thailand kept handing out
// a citizenLife.js with a SyntaxError (every visitor stuck on the boot
// splash) long after the fix was deployed. A content change must move the
// token (`npm run bump`), or the edge never sees it.
//
//   node scripts/check-bump.mjs            # before deploy: fail if unbumped
//   node scripts/check-bump.mjs --record   # after a successful deploy
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const STATE = '.deploy-state.json'
const token = readFileSync('public/js/boot.js', 'utf8').match(/\?v=(\d+\.\d+\.\d+)/)?.[1]
if (!token) { console.error('✗ no ?v= token found in public/js/boot.js'); process.exit(1) }

// The second deploy guard, for the failure the first one cannot see.
//
// The token check below proves the ASSETS moved. It says nothing about whether
// anyone wrote down what shipped. Two releases did exactly that: 2.4.67 on
// 2026-10-03 and 2.4.72 on 2026-10-11 — both deployed, both absent from
// CHANGELOG.md, both found later by a reader rather than by a tool. The
// changelog's own header says "if a feature is in the code but not in this log,
// it is in the wrong place", and until now nothing enforced it.
//
// Placed before the "assets unchanged" early exit so it runs on every deploy,
// including the --record pass.
//
// Accepts either naming convention this project has used. Older entries are
// headed by the product version and name the asset token inside the heading —
// "## [3.3.1] — 2026-09-20 · token 2.4.33" — while recent ones are headed by
// the token itself. A guard that only understood one of them would block a
// correctly documented release, which is its own kind of wrong.
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const esc = token.replace(/\./g, '\\.')
const documented =
  new RegExp(`^## \\[${esc}\\]`, 'm').test(changelog) ||
  new RegExp(`^## \\[[^\\]]+\\][^\\n]*\\btoken ${esc}\\b`, 'm').test(changelog)
if (!documented) {
  console.error(
    `✗ the asset token is ?v=${token} but CHANGELOG.md documents no release carrying it.\n` +
    `  Accepted forms: a "## [${token}]" heading, or any heading naming "token ${token}".\n` +
    `  Assets deployed without a release note have shipped three times (2.4.67, 2.4.69, 2.4.72).\n` +
    `  Add the entry describing what this release changed, then deploy again.`)
  process.exit(1)
}

const h = createHash('sha256')
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|css)$/.test(n)) h.update(p).update(readFileSync(p))
  }
}
walk('public/js'); walk('public/css')
const hash = h.digest('hex')

if (process.argv.includes('--record')) {
  writeFileSync(STATE, JSON.stringify({ token, hash, at: new Date().toISOString() }) + '\n')
  console.log(`✓ recorded deploy of assets ${hash.slice(0, 12)} under ?v=${token}`)
  process.exit(0)
}
const last = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
if (last && last.token === token && last.hash !== hash) {
  console.error(`✗ JS/CSS changed since the last deploy but the asset token is still ?v=${token}.\n  The Cloudflare edge would keep serving the old files for up to 7 days.\n  Run: npm run bump   (then npm test, then npm run deploy)`)
  process.exit(1)
}
console.log(`✓ asset token ?v=${token} ${last?.token === token ? '(assets unchanged)' : '(new token)'}`)
