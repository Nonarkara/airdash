// Store the DustBoy (CMU CCDC) API token in the DB kv table — never in a
// committed file, shell history, or `launchctl setenv` (which is lost at
// reboot, after which the source would silently skip again). Usage:
//   node scripts/set-dustboy-token.mjs      (prompts, input hidden)
// Get a free token at https://open-api.cmuccdc.org/. The source reads it on
// its next hourly run — no restart needed.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const { promptHidden } = await import('./lib/prompt-hidden.mjs')
const token = (await promptHidden('Paste your DustBoy API token (from open-api.cmuccdc.org): ')).trim()
if (token.length < 10 || /\s/.test(token)) {
  console.error('✗ That does not look like an API token. Nothing stored.')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
openDb().kvSet('dustboy_token', token)
console.log('✓ DustBoy token stored in the database kv table — DustBoy sensors start flowing on the next hourly run.')
