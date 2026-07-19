// Configure the AirDash LINE Messaging API channel.
//
// Two modes:
//
//   1. PREFERRED — self-minting (the server refreshes the 30-day access
//      token for you, so it never expires mid-season). Provide the channel
//      ID and channel secret from the LINE Developers console:
//
//        node scripts/set-line-token.mjs <channel_id> <channel_secret>
//
//   2. LEGACY — paste a long-lived channel access token (set it to never
//      expire in the LINE console, otherwise it dies in 30 days and the
//      broadcast module goes dormant). The server will still TRY to mint
//      a fresh token from the id+secret if both are present, so the
//      legacy path is mostly an escape hatch for testing.
//
//      node scripts/set-line-token.mjs <channel_access_token>
//
// The secret is stored in the DB kv table. It is NEVER printed and NEVER
// returned by the admin GET endpoint — only a masked suffix for sanity.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const argv = process.argv.slice(2)
if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
  console.log('usage:')
  console.log('  node scripts/set-line-token.mjs <channel_id> <channel_secret>   # preferred — self-mint')
  console.log('  node scripts/set-line-token.mjs <channel_access_token>          # legacy — long-lived token')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
const { createLine } = await import('../server/line.js')
const db = openDb()
const line = createLine(db)

if (argv.length >= 2) {
  const [channelId, channelSecret] = argv
  if (channelId.length < 5 || channelSecret.length < 10) {
    console.error('channel_id should be ≥5 chars; channel_secret ≥10 chars')
    process.exit(2)
  }
  db.kvSet('line_channel_id', channelId)
  db.kvSet('line_channel_secret', channelSecret)
  console.log('✓ LINE channel id + secret stored — minting first access token...')
  const t = await line.mintToken()
  if (t) {
    console.log('✓ Token minted — broadcasts will fire within 5 min on severe (sev ≥ 2) alerts.')
  } else {
    console.error('✗ Mint failed — check the channel id + secret at developers.line.biz/console/')
    process.exit(1)
  }
} else {
  // Legacy single-token mode.
  const token = argv[0]?.trim()
  if (!token || token.length < 20) {
    console.error('channel access token looks too short (need ≥20 chars).')
    process.exit(2)
  }
  db.kvSet('line_channel_token', token)
  db.kvSet('line_token_minted_at', String(Date.now()))
  console.log('✓ LINE channel token stored — broadcasts enabled (legacy 30d mode).')
}

const status = line.status()
console.log('  has_token:', status.has_token)
console.log('  has_id_secret:', status.has_id_secret)
console.log('  minted_at:', status.minted_at)
console.log('  probe_ok:', status.probe_ok)
