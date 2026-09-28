// Store the NVIDIA NIM API key in the DB's kv table (never in a committed
// file). Usage (prompts, input hidden — the key never lands in shell history):
//   node scripts/set-llm-key.mjs
// The server reads it on the next chat/embed call — no restart needed for
// the key itself, though the status probe caches for 5 minutes.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const { promptHidden } = await import('./lib/prompt-hidden.mjs')

const key = (process.argv[2] ?? await promptHidden('Paste your NVIDIA NIM key (nvapi-…, get one free at build.nvidia.com): ')).trim()
if (!key.startsWith('nvapi-')) {
  console.error('✗ That does not look like a NIM key (it should start with nvapi-). Nothing stored.')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
const db = openDb()
db.kvSet('nim_api_key', key)
console.log('✓ NIM key stored in the database kv table.')

// Quick round-trip so a bad key fails HERE, not silently in the dashboard.
const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(10_000),
}).catch((e) => ({ ok: false, status: String(e?.message ?? e) }))
if (res.ok) console.log('✓ Key verified against integrate.api.nvidia.com.')
else console.error(`✗ Key stored but verification failed (${res.status}) — check the key.`)
