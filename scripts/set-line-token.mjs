// Store the LINE Messaging API channel access token that turns on OA alert
// broadcasts. Free: developers.line.biz → create provider → Messaging API
// channel → issue a long-lived channel access token. Usage:
//   node scripts/set-line-token.mjs <channel access token>
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const token = process.argv[2]?.trim()
if (!token || token.length < 20) {
  console.error('usage: node scripts/set-line-token.mjs <channel access token>')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
const db = openDb()
db.kvSet('line_channel_token', token)
console.log('✓ LINE channel token stored — severe alerts (sev ≥ 2) now broadcast to OA followers, batched ≤1 push/30min.')

const res = await fetch('https://api.line.me/v2/bot/info', {
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15_000),
}).catch((e) => ({ ok: false, status: String(e?.message ?? e) }))
if (res.ok) {
  const info = await res.json()
  console.log(`✓ Token verified — bot "${info.displayName}" (@${info.basicId ?? '?'}).`)
} else console.error(`✗ Token stored but LINE verification failed (${res.status}) — check the channel access token.`)
