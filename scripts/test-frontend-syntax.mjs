// Every browser module must parse as ESM. On 2026-09-27 one lost function
// header in citizenLife.js (a top-level `return`) stopped main.js from ever
// running: the dashboard sat on its boot splash for every visitor while all
// server health checks stayed green. node --check on the server never sees
// these files, so parse them here.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOTS = ['public/js', 'functions']
const files = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) files.push(p)
  }
}
ROOTS.forEach(walk)

let failed = 0
for (const f of files) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(f) })
  if (r.status !== 0) {
    failed++
    console.log(`FAIL ${f}\n${String(r.stderr).split('\n').slice(0, 4).join('\n')}`)
  }
}
console.log(`\n${files.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
