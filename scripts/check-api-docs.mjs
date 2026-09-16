// API documentation coverage — a public route nobody can discover is not a
// public route, and a documented route that 404s is worse than none.
// Ported from the FloodDash twin's tests/apiDocs.test.mjs (2026-09-16).
//
//   1. every path documented in public/js/panels/apidocs.js is served by
//      server/api.js (exact key, or a :param template);
//   2. every GET route in server/api.js is documented, or is on the
//      NOT_PUBLISHED list with a reason.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

const api = readFileSync(join(ROOT, 'server', 'api.js'), 'utf8')
const panel = readFileSync(join(ROOT, 'public', 'js', 'panels', 'apidocs.js'), 'utf8')

const served = new Map() // path → Set(methods)
for (const m of api.matchAll(/^\s*'(GET|POST|PUT|DELETE|PATCH) (\/api\/[^']+)':/gm)) {
  if (!served.has(m[2])) served.set(m[2], new Set())
  served.get(m[2]).add(m[1])
}
const documented = [...panel.matchAll(/\bpath: '(\/api\/[^']+)'/g)].map((m) => m[1])
const docMethods = new Map()
for (const m of panel.matchAll(/\bpath: '(\/api\/[^']+)'[^\n]*?method: '([A-Z]+)'/g)) docMethods.set(m[1], m[2])

// Routes deliberately not part of the published surface. Anything NOT on this
// list must appear on the page — add the doc, or add the reason.
const NOT_PUBLISHED = [
  '/api/admin/',            // operator-only, token-gated
  '/api/line/',             // LINE webhook + subscription plumbing
  '/api/telegram/',         // Telegram webhook + binding plumbing
  '/api/chat/logs',         // contains what real people typed
  '/api/chat/faqs',         // FAQ moderation, admin token
  '/api/exports/build',     // triggers work; the built files are public, this is not
  '/api/ping',              // bare liveness string for the tunnel, not JSON
]

check(`panel documents ${documented.length} endpoints`, documented.length >= 50, `got ${documented.length}`)
check('no path is documented twice', new Set(documented).size === documented.length)

for (const path of documented) {
  const method = docMethods.get(path) ?? 'GET'
  const ok = served.get(path)?.has(method)
  check(`${method} ${path} is served`, !!ok, `documented in apidocs.js but not in server/api.js`)
}

const undocumented = [...served.entries()]
  .filter(([path, methods]) => methods.has('GET'))
  .map(([path]) => path)
  .filter((p) => !NOT_PUBLISHED.some((prefix) => p.startsWith(prefix)))
  .filter((p) => !documented.includes(p))
check('every public GET route is documented, or explicitly not published', undocumented.length === 0,
  `undocumented: ${undocumented.join(', ')}`)

// The Twin API must be documented and its contract must exist in both places.
check('/api/twin is documented', documented.includes('/api/twin'))
check('docs/TWIN-API.md exists and names both twins', (() => {
  try { const d = readFileSync(join(ROOT, 'docs', 'TWIN-API.md'), 'utf8'); return /flood\.nonarkara\.org\/api\/twin/.test(d) && /air\.nonarkara\.org\/api\/twin/.test(d) } catch { return false }
})())

// The page must be reachable: tab + pane in ops.html, init in main.js.
const ops = readFileSync(join(ROOT, 'public', 'ops.html'), 'utf8')
const main = readFileSync(join(ROOT, 'public', 'js', 'main.js'), 'utf8')
check('ops.html has the apidocs tab', /data-about-pane="apidocs"[^>]*>/.test(ops) && /class="about-tab" data-about-pane="apidocs"/.test(ops))
check('ops.html has the apidocs pane', /id="apidocs-content"/.test(ops))
check('main.js inits the panel', /safeInit\('apidocs', initApiDocs\)/.test(main))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
