// Store the NVIDIA NIM API key in the DB's kv table (never in a committed
// file). Usage:
//   node scripts/set-llm-key.mjs nvapi-xxxxxxxxxxxxxxxx
// The server reads it on the next chat/embed call — no restart needed for
// the key itself, though the status probe caches for 5 minutes.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const key = process.argv[2]?.trim()
if (!key || !key.startsWith('nvapi-')) {
  console.error('usage: node scripts/set-llm-key.mjs nvapi-...   (get one free at build.nvidia.com)')
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
