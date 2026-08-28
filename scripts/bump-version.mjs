#!/usr/bin/env node
// Cache-bump: move the whole front-end to a new ?v= asset token AND the
// service-worker cache/shell name, atomically and in lockstep.
//
// WHY THIS EXISTS
// The asset token (?v=X.Y.Z) and the SW cache name (airdash-vNN) must both
// advance whenever shipped front-end content changes, and the SW `shell`
// constant in ops.html must always equal the CACHE constant in sw.js.
// Doing this by hand across ~40 files is exactly the operation that has
// shipped broken before ("edge poisoned old css under the 2.4.7 key"): miss
// one file and returning visitors get a stale bundle served
// stale-while-revalidate; desync shell/CACHE and the boot migration wipes
// the service worker on every session. scripts/check-consistency.mjs
// catches the mistake after the fact — this prevents it.
//
// Usage:
//   node scripts/bump-version.mjs                 # auto-increment patch (X.Y.Z -> X.Y.Z+1)
//   node scripts/bump-version.mjs 2.5.0           # set an explicit asset token
//   node scripts/bump-version.mjs --dry-run       # show what would change, touch nothing
//
// The SW cache name (airdash-vNN) always auto-increments by 1; it is an
// opaque counter, not tied to the semantic asset token.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const explicit = args.find((a) => /^\d+\.\d+\.\d+$/.test(a)) ?? null

const read = (p) => readFileSync(p, 'utf8')

// ── Find the current asset token from ops.html (the source of truth) ──────
const opsPath = join(PUBLIC, 'ops.html')
const ops = read(opsPath)
const curToken = ops.match(/\?v=(\d+\.\d+\.\d+)/)?.[1]
if (!curToken) { console.error('FATAL: no ?v=X.Y.Z token found in public/ops.html'); process.exit(1) }

const nextToken = explicit ?? (() => {
  const [maj, min, pat] = curToken.split('.').map(Number)
  return `${maj}.${min}.${pat + 1}`
})()
if (nextToken === curToken && !explicit) {
  console.error('FATAL: computed the same token; pass an explicit one'); process.exit(1)
}

// ── SW cache/shell name: airdash-vNN -> airdash-v(NN+1) ───────────────────
const swPath = join(PUBLIC, 'sw.js')
const sw = read(swPath)
const curCache = sw.match(/const CACHE = '(airdash-v\d+)'/)?.[1]
if (!curCache) { console.error('FATAL: no CACHE = \'airdash-vNN\' in public/sw.js'); process.exit(1) }
const cacheNum = Number(curCache.match(/v(\d+)$/)[1])
const nextCache = `airdash-v${cacheNum + 1}`

const shellInOps = ops.match(/const shell = '(airdash-v\d+)'/)?.[1]
if (shellInOps !== curCache) {
  console.error(`FATAL: shell/CACHE already desynced (ops.html shell=${shellInOps}, sw.js CACHE=${curCache}).`)
  console.error('Fix that by hand first, then bump.'); process.exit(1)
}

console.log(`asset token : ${curToken}  ->  ${nextToken}`)
console.log(`SW cache    : ${curCache}  ->  ${nextCache}`)
if (dryRun) console.log('\n(dry run — nothing written)')

// ── Walk public/, rewrite tokens ──────────────────────────────────────────
// Only text asset-reference files. Never rewrite binaries or the geojson
// (its coordinate digits can collide with a token regex if you are careless).
const TEXT_EXT = new Set(['.html', '.js', '.css', '.webmanifest', '.json', '.xml'])
const SKIP_DIRS = new Set(['vendor', 'fonts', 'geo', 'img', 'photos'])
const tokenRe = new RegExp(`\\?v=${curToken.replace(/\./g, '\\.')}`, 'g')

let filesChanged = 0, refsChanged = 0
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue }
    if (!TEXT_EXT.has(name.slice(name.lastIndexOf('.')))) continue
    const before = read(p)
    const hits = (before.match(tokenRe) || []).length
    if (!hits) continue
    const after = before.replace(tokenRe, `?v=${nextToken}`)
    if (!dryRun) writeFileSync(p, after)
    filesChanged++; refsChanged += hits
    console.log(`  ${hits.toString().padStart(3)} refs  ${p.replace(ROOT + '/', '')}`)
  }
}
walk(PUBLIC)

// ── SW cache + ops.html shell, in lockstep ────────────────────────────────
if (!dryRun) {
  writeFileSync(swPath, read(swPath).replace(`const CACHE = '${curCache}'`, `const CACHE = '${nextCache}'`))
  writeFileSync(opsPath, read(opsPath).replace(`const shell = '${curCache}'`, `const shell = '${nextCache}'`))
}
console.log(`\n${filesChanged} files, ${refsChanged} asset refs${dryRun ? ' (would be)' : ''} bumped; SW cache/shell -> ${nextCache}`)
if (!dryRun) console.log('Next: run `npm test` (consistency check will confirm), then deploy.')
