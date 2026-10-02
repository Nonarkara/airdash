// Regression tests for server/opsSentinel.js — see its header for the
// 2026-09-26/27 incident (DB offloaded to a USB spinning disk froze the
// synchronous server; the watchdog was unloaded, so nothing noticed for ~32 h).
import { dbOnExternalVolume, heartbeatAgeS, probeArchiveStorage } from '../server/opsSentinel.js'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

check('the exact path that caused the outage is flagged external',
  dbOnExternalVolume('/Volumes/Data/Offload-2026-09-26-air/AirDash-data/airdash.db'))
check('the normal internal path is not flagged', !dbOnExternalVolume('/Users/axiom/AirDash/data/airdash.db'))
check('a relative internal path is not flagged', !dbOnExternalVolume('data/airdash.db'))

const now = 2_000_000_000
check('fresh heartbeat -> small age', heartbeatAgeS(String(now - 120), now) === 120)
check('heartbeat with trailing newline parses', heartbeatAgeS(`${now - 60}\n`, now) === 60)
check('missing/empty heartbeat -> null (treated as stale)', heartbeatAgeS('', now) === null)
check('garbage heartbeat -> null', heartbeatAgeS('not-a-number', now) === null)

const device = (dev, directory = false) => ({ dev, isDirectory: () => directory, isFile: () => !directory })
const options = {volumePath:'/volume',archivePath:'/volume/archive.db',internalPath:'/ssd/live.db'}
check('a mounted external archive is verified independently of receipt age', (await probeArchiveStorage({...options,stat:async p=>p==='/volume'?device(2,true):device(p.startsWith('/ssd')?1:2)})).available === true)
check('a missing drive cannot be concealed by a recent receipt', (await probeArchiveStorage({...options,stat:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'})}})).available === false)
check('an unmounted directory on the internal disk is not an external backup', (await probeArchiveStorage({...options,stat:async p=>device(1,p==='/volume')})).reason === 'external-volume-not-mounted')
check('archive file must be on the mounted external device', (await probeArchiveStorage({...options,stat:async p=>p==='/volume'?device(2,true):device(1)})).reason === 'archive-not-on-external-volume')
check('a stalled drive probe has a bounded deadline', (await probeArchiveStorage({...options,stat:()=>new Promise(()=>{}),timeoutMs:10})).reason === 'probe-timeout')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
