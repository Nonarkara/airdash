// The preprint tab: the files it points at are the files that were built.
//
// WHY THIS GUARD EXISTS
// The Preprint tab draws /paper/<pdf> with a vendored pdf.js. Three things can
// rot silently: the manifest can describe a different PDF than the one on disk
// (so "Download · 459 kB" lies), the tab can lose its pane or its init (a dead
// tab that still looks wired), and the paper's numbers can drift from the
// analysis they were computed from. This checks all three — the last by
// rendering the manuscript template, which stops on any missing data path or
// missing reference.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '..')
const rd = (p) => readFileSync(join(ROOT, p), 'utf8')
let failed = 0, passed = 0
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error(`✗ ${msg}`) } }
const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex')

const man = JSON.parse(rd('public/paper/manifest.json'))
for (const [kind, rec] of [['pdf', man.pdf], ['supplement', man.supplement]]) {
  const p = `public/paper/${rec.file}`
  ok(existsSync(join(ROOT, p)), `${kind}: ${p} exists`)
  if (!existsSync(join(ROOT, p))) continue
  ok(statSync(join(ROOT, p)).size === rec.bytes, `${kind}: manifest bytes match the file`)
  ok(sha(p) === rec.sha256, `${kind}: manifest sha256 matches the file (rebuild with paper/publish.py)`)
}
ok(readFileSync(join(ROOT, `public/paper/${man.pdf.file}`)).subarray(0, 5).toString() === '%PDF-', 'pdf starts with %PDF-')
ok(man.pdf.file.includes(man.version), 'pdf filename carries the manifest version')
ok(Number.isInteger(man.pages) && man.pages >= 1, 'manifest has a page count')

const html = rd('public/ops.html')
ok(/class="about-tab"[^>]*data-about-pane="preprint"/.test(html), 'ops.html has the Preprint tab')
ok(/class="about-body about-pane"[^>]*data-about-pane="preprint"/.test(html), 'ops.html has the Preprint pane')
ok(/data-i18n="พรีพรินต์\|Preprint"/.test(html), 'the Preprint tab is bilingual')
const main = rd('public/js/main.js')
ok(/panels\/preprint\.js\?v=/.test(main) && /safeInit\('preprint', initPreprint\)/.test(main), 'main.js imports and initialises the preprint panel')
const js = rd('public/js/panels/preprint.js')
ok(js.includes("/lib/pdfjs-4.10.38/pdf.min.mjs") && js.includes("/lib/pdfjs-4.10.38/pdf.worker.min.mjs"), 'viewer loads the vendored pdf.js, never a CDN')
ok(!/https?:\/\//.test(js.replace(/\/\/.*$/gm, '')), 'viewer code makes no cross-origin request')
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'LICENSE']) ok(existsSync(join(ROOT, 'public/lib/pdfjs-4.10.38', f)), `lib/pdfjs-4.10.38/${f} is present`)
ok(/'\.mjs':\s*'text\/javascript/.test(rd('server/http.js')) && /'\.pdf':\s*'application\/pdf'/.test(rd('server/http.js')), 'the server types .mjs and .pdf (a module served as octet-stream will not load)')

const redirects = rd('public/_redirects')
ok(/^\/paper\/\*\s+\/paper\/:splat\s+200/m.test(redirects) && /^\/lib\/\*\s+\/lib\/:splat\s+200/m.test(redirects), '_redirects passes /paper and /lib through (the catch-all would serve ops.html for the PDF)')

// The paper's numbers come from the analysis: rendering the template stops on any gap.
const py = spawnSync('python3', ['paper/build.py', '--no-pdf'], { cwd: ROOT, encoding: 'utf8' })
if (py.error) console.log('· python3 unavailable — skipped the manuscript render check')
else {
  ok(py.status === 0, `manuscript renders from data and references (${(py.stderr || py.stdout).trim().split('\n').pop()})`)
  ok(/(\d+) references cited/.test(py.stdout) && !/Missing|missing/.test(py.stdout), 'every citation resolves to a verified reference')
}

console.log(`${failed ? '✗' : '✓'} preprint: ${passed} checks passed${failed ? `, ${failed} FAILED` : ''}`)
process.exit(failed ? 1 : 0)
