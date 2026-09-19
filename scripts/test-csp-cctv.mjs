// The CCTV player needs four things from the page CSP; a missing one leaves every
// camera a black box with no visible error (found 2026-09-20 on FloodDash, where
// only script-src had ever been fixed): hls.js from the CDN (script-src), the
// playlists + segments from the camera servers (connect-src), MSE playback from
// a blob: URL (media-src, else default-src 'self' blocks it) and the NST iframes
// (frame-src). AirDash's CSP lives ONLY in public/_headers (Cloudflare Pages) —
// the local server sets none — so a local test cannot see it; this reads the file.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const csp = readFileSync(join(ROOT, 'public', '_headers'), 'utf8').match(/Content-Security-Policy:\s*([^\n]+)/)?.[1] ?? ''
const dir = (name) => (csp.match(new RegExp(`(?:^|; )${name} ([^;]*)`)) ?? [])[1]?.split(' ') ?? []
const allows = (list, url) => {
  const u = new URL(url)
  return list.some((src) => src.startsWith('https://*.') ? u.protocol === 'https:' && u.host.endsWith(src.slice('https://*'.length)) : src === u.origin)
}
const streams = ['https://camerai1.iticfoundation.org/x.m3u8', 'https://camera1.iticfoundation.org/x.m3u8',
  'https://streaming.noc.nakhoncity.org/x.m3u8', 'https://streaming1.highwaytraffic.go.th/x.m3u8', 'https://streaming2.highwaytraffic.go.th/x.m3u8']

check('a CSP is present in public/_headers', csp.length > 20)
check('hls.js can load from its CDN (script-src)', dir('script-src').includes('https://cdn.jsdelivr.net'))
for (const u of streams) {
  check(`connect-src allows ${new URL(u).host}`, allows(dir('connect-src'), u))
  check(`media-src allows ${new URL(u).host}`, allows(dir('media-src'), u))
}
check("media-src allows blob: (MSE plays from a blob URL)", dir('media-src').includes('blob:'))
check('frame-src allows the NST iframes', dir('frame-src').includes('https://nstcctv.nakhoncity.org'))
check('the CSP did not become permissive (still default-src self, no wildcard scripts)', dir('default-src').join() === "'self'" && !dir('script-src').includes('*') && !dir('script-src').includes("'unsafe-eval'"))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
