// The Twin API + public CORS contract (docs/TWIN-API.md).
// Pure shape checks on server/twin.js, then a live ephemeral server to
// prove the headers a browser on another origin actually receives — the
// failure this locks: until 2026-09-16 AirDash sent no CORS at all.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { buildTwin, twinProvince, readAppVersion } from '../server/twin.js'
import { startHttp, json, isPublicApiRead, PRIVATE_API_PREFIXES } from '../server/http.js'
import { CONFIG } from '../server/config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// ── shape ──
{
  const risk = {
    updated: '2026-09-16T12:00:00.000Z',
    provinces: [
      { province_code: 10, province_th: 'กรุงเทพมหานคร', province_en: 'Bangkok', score: 31, band: 'watch',
        pm25: 28.4, aqi: 61, pm25_fc_24h: 30, washout_band: 'light', washout_expected_pct: 12,
        card: { level: 'watch', head_th: 'เฝ้าระวังฝุ่น', head_en: 'Keep watch', reasons: [{ th: 'ก', en: 'a' }, { th: 'ข', en: 'b' }] } },
      { province_code: null, province_th: 'ไม่มีรหัส', score: 99 },       // no code → dropped
      { province_code: '50', province_th: 'เชียงใหม่', province_en: 'Chiang Mai', score: 3, band: 'normal', pm25: null },
    ],
  }
  const out = buildTwin({ risk, dangerRows: [{ province_code: '10', score: 44, band: 'moderate' }], version: '2.4.30' })
  check('system/domain/version/licence present', out.system === 'airdash' && out.domain === 'air' && out.version === '2.4.30' && /CC BY 4\.0/.test(out.licence))
  check('updated comes from the risk engine', out.updated === '2026-09-16T12:00:00.000Z')
  check('disclaimer is bilingual and names the hotlines', /1650/.test(out.disclaimer_th) && /1650/.test(out.disclaimer_en))
  check('provinces without a code are dropped', out.provinces.length === 2)
  const bkk = out.provinces[0]
  check('code is a string join key even when the engine gives a number', bkk.code === '10')
  check('score/band/level/headline carried', bkk.score === 31 && bkk.band === 'watch' && bkk.level === 'watch' && bkk.head_en === 'Keep watch')
  check('top reason only, bilingual', bkk.reason_th === 'ก' && bkk.reason_en === 'a')
  check('air domain fields carried', bkk.pm25 === 28.4 && bkk.aqi === 61 && bkk.pm25_fc_24h === 30 && bkk.washout_band === 'light' && bkk.washout_expected_pct === 12)
  check('danger joined by code', bkk.danger_band === 'moderate' && bkk.danger_score === 44)
  const cm = out.provinces[1]
  check('missing values are null, never undefined/NaN', cm.pm25 === null && cm.reason_th === null && cm.danger_score === null && cm.level === 'safe')
  check('no undefined leaks into JSON', !JSON.stringify(out).includes('undefined'))
  check('twinProvince tolerates a bare row', twinProvince({ province_code: '1' }).code === '1')
}

// ── version ──
{
  const v = readAppVersion(join(ROOT, 'public'))
  const ops = readFileSync(join(ROOT, 'public', 'ops.html'), 'utf8').match(/\?v=(\d+\.\d+\.\d+)/)?.[1]
  check('readAppVersion returns the ops.html asset token', v && v === ops, `got ${v}`)
  check('readAppVersion returns null on a missing dir', readAppVersion('/nonexistent-dir') === null)
}

// ── CORS policy (pure) ──
{
  check('GET /api/twin is a public read', isPublicApiRead('GET', '/api/twin'))
  check('OPTIONS /api/snapshot is a public read (preflight)', isPublicApiRead('OPTIONS', '/api/snapshot'))
  check('POST /api/chat is not', !isPublicApiRead('POST', '/api/chat'))
  check('GET /api/admin/line-reports is private', !isPublicApiRead('GET', '/api/admin/line-reports'))
  check('GET /api/telegram/stats is private', !isPublicApiRead('GET', '/api/telegram/stats'))
  check('static assets never get API CORS', !isPublicApiRead('GET', '/js/main.js'))
  check('private list covers admin, telegram, line, chat logs/faqs, export build',
    ['/api/admin/', '/api/telegram/', '/api/line/', '/api/chat/logs', '/api/chat/faqs', '/api/exports/build'].every((p) => PRIVATE_API_PREFIXES.includes(p)))
}

// ── live headers ──
{
  const routes = {
    'GET /api/twin': (req, res) => json(res, 200, { ok: true }),
    'GET /api/admin/line-reports': (req, res) => json(res, 200, { secret: true }),
  }
  const saved = CONFIG.port
  CONFIG.port = 0
  const server = startHttp(routes)
  CONFIG.port = saved
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const stranger = await fetch(`${base}/api/twin`, { headers: { origin: 'https://someone-elses-dashboard.example' } })
    check('public read answers * to any origin', stranger.headers.get('access-control-allow-origin') === '*')
    check('exposes the stale-seconds header', /x-airdash-stale-seconds/.test(stranger.headers.get('access-control-expose-headers') ?? ''))
    const pre = await fetch(`${base}/api/twin`, { method: 'OPTIONS', headers: { origin: 'https://x.example', 'access-control-request-method': 'GET' } })
    check('preflight is 204 with CORS', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*', `status ${pre.status}`)
    const admin = await fetch(`${base}/api/admin/line-reports`, { headers: { origin: 'https://x.example' } })
    check('operator surface gets no CORS from any origin', admin.headers.get('access-control-allow-origin') === null)
    const adminPre = await fetch(`${base}/api/admin/line-reports`, { method: 'OPTIONS', headers: { origin: 'https://x.example' } })
    check('operator preflight is refused (405, no CORS)', adminPre.status === 405 && adminPre.headers.get('access-control-allow-origin') === null, `status ${adminPre.status}`)
  } finally {
    server.close()
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
