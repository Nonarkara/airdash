// Store the NASA Earthdata Login token that unlocks the IMERG satellite-rain
// source. Free account: register at urs.earthdata.nasa.gov, approve the
// "NASA GESDISC DATA ARCHIVE" app in your profile, then Profile → Generate
// Token. Usage:
//   node scripts/set-earthdata-token.mjs <token>
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const token = process.argv[2]?.trim()
if (!token || token.length < 40) {
  console.error('usage: node scripts/set-earthdata-token.mjs <EDL token>  (from urs.earthdata.nasa.gov → Profile → Generate Token)')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
const db = openDb()
db.kvSet('earthdata_token', token)
console.log('✓ Earthdata token stored — the imerg source activates on its next scheduled pass (≤30 min).')

// Round-trip: request a tiny IMERG subset so a bad token/missing app approval
// fails HERE with a clear message.
const probe = 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHE.07/contents.html'
const res = await fetch(probe, {
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20_000),
}).catch((e) => ({ ok: false, status: String(e?.message ?? e) }))
if (res.ok) console.log('✓ Token accepted by GES DISC.')
else console.error(`✗ Token stored but GES DISC probe failed (${res.status}) — check the token and that "NASA GESDISC DATA ARCHIVE" is approved in your Earthdata profile.`)
