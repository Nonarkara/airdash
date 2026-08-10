// Repo consistency checks — the invariants that are easy to break in a
// hurry and expensive to notice in production. No network, no DB.
//
// These exist because each one has actually shipped broken at least once:
//
//  1. ops.html's `shell` constant MUST equal sw.js's CACHE name. The boot
//     migration deletes every airdash-*/flooddash-* cache whose name !==
//     shell. If they drift, EVERY first page view of a session
//     unregisters the service worker, nukes the cache and force-reloads —
//     the PWA silently stops working and users eat an extra reload.
//
//  2. Every ?v=-versioned asset referenced by the HTML must exist on
//     disk. A typo here is a 404 for a stylesheet or an ES module, which
//     on the story page means a blank screen.
//
//  3. When a versioned asset's CONTENT changes, its ?v= token has to
//     change too. The service worker serves static assets
//     stale-while-revalidate, so an unchanged URL means returning
//     visitors get the OLD file on their next visit and the new one only
//     after that — the classic "works on my machine, broken for users,
//     fixes itself later" report. We can't diff against production from
//     here, so this check enforces the weaker but still useful rule:
//     assets sharing a version token must be declared together, and the
//     token must not be a placeholder.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// ── 1. Service-worker shell / cache-name invariant ───────────────────────
{
  const ops = read('public/ops.html')
  const sw = read('public/sw.js')
  const shell = ops.match(/const shell = '([^']+)'/)?.[1] ?? null
  const cache = sw.match(/const CACHE = '([^']+)'/)?.[1] ?? null
  check('ops.html declares a shell constant', shell !== null)
  check('sw.js declares a CACHE constant', cache !== null)
  check('shell === CACHE (or the SW is nuked every session)',
    shell !== null && shell === cache,
    `ops.html shell=${shell} vs sw.js CACHE=${cache} — bump BOTH together`)
}

// ── 2. Versioned assets referenced by the HTML exist on disk ─────────────
{
  const pages = ['public/index.html', 'public/ops.html']
  const missing = []
  const tokens = new Map()   // token -> [asset, ...]
  for (const page of pages) {
    const html = read(page)
    // href/src="/css/foo.css?v=TOKEN" — local, versioned assets only.
    for (const m of html.matchAll(/(?:href|src)="(\/[^"?]+)\?v=([^"]+)"/g)) {
      const [, assetPath, token] = m
      if (!existsSync(join(ROOT, 'public', assetPath))) {
        missing.push(`${page} → ${assetPath}`)
      }
      if (!tokens.has(token)) tokens.set(token, [])
      tokens.get(token).push(assetPath)
    }
  }
  check('every versioned asset referenced by the HTML exists',
    missing.length === 0, missing.join('\n       '))

  const placeholders = [...tokens.keys()].filter((t) => /^(x|todo|dev|latest|0)$/i.test(t))
  check('no placeholder version tokens', placeholders.length === 0,
    `placeholder tokens: ${placeholders.join(', ')}`)
  check('at least one versioned asset is tracked', tokens.size > 0)
}

// ── 3. The story bundle shares one token across HTML + CSS + JS ──────────
// story.css and story.js are edited together far more often than not; a
// bump that moves only one of them leaves the pair mismatched in the
// cache. Assert they always carry the same token.
{
  const html = read('public/index.html')
  const cssTok = html.match(/\/css\/story\.css\?v=([^"]+)"/)?.[1] ?? null
  const jsTok = html.match(/\/js\/story\.js\?v=([^"]+)"/)?.[1] ?? null
  check('story.css and story.js carry the same version token',
    cssTok !== null && cssTok === jsTok,
    `story.css=${cssTok} story.js=${jsTok}`)
}

// ── 4. No committed secrets in the obvious shapes ────────────────────────
{
  const suspects = [
    'server/config.js', 'public/index.html', 'public/ops.html',
    'public/sw.js', 'wrangler.toml',
  ].filter((p) => existsSync(join(ROOT, p)))
  const pattern = /(?:api[_-]?key|secret|password|bearer)\s*[:=]\s*['"][A-Za-z0-9_\-.]{16,}['"]/i
  const hits = suspects.filter((p) => pattern.test(read(p)))
  check('no hard-coded credentials in committed config/pages',
    hits.length === 0, hits.join(', '))
}

// ── 5. Service worker must register bare /sw.js (no ?v=) ─────────────────
// The SPA catch-all `/* → /ops 200` does not see query strings as part of
// the `/sw.js` pass-through. `register('/sw.js?v=…')` therefore fetched
// ops.html as the worker script. story.js already used the bare path;
// keep main.js in lockstep, and keep /sw.js listed in _redirects.
{
  const main = read('public/js/main.js')
  const story = read('public/js/story.js')
  const redirects = read('public/_redirects')
  const badMain = /serviceWorker\.register\(\s*['"`]\/sw\.js\?/.test(main)
  const okMain = /serviceWorker\.register\(\s*['"`]\/sw\.js['"`]\s*\)/.test(main)
  const okStory = /serviceWorker\.register\(\s*['"`]\/sw\.js['"`]\s*\)/.test(story)
  const passThrough = /^\/sw\.js\s+\/sw\.js\s+200\s*$/m.test(redirects)
  check('main.js registers bare /sw.js (no ?v=)', okMain && !badMain,
    'use navigator.serviceWorker.register(\'/sw.js\') — query strings SPA-fallback to ops.html')
  check('story.js registers bare /sw.js', okStory)
  check('_redirects pass-through for /sw.js', passThrough,
    'add `/sw.js  /sw.js  200` before the /* catch-all')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
