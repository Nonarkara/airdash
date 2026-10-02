// Which cameras can computer vision actually reach, and which cannot —
// proven, not assumed.
//
// Three things are under test here, and each one exists because it was
// measured to be wrong before:
//
//  1. resolveHls() used to double-prefix an already-absolute iTIC URL, turning
//     https://camerai1.iticfoundation.org/hls/ccs22.m3u8 into
//     https://camera1.iticfoundation.org/hls/https://camerai1.../ccs22.m3u8
//     which 404s. That silently marked 115 catalogue cameras dead; re-probing
//     the repaired URLs with ffmpeg brought 57 of them back (2026-09-29).
//
//  2. classifyStream() replaced one bucket called 'embed' with five kinds,
//     because 572 BMA cameras and 208 NST embeds are not the same problem:
//     one serves a blank white frame, the other is WebRTC-only.
//
//  3. A blank frame must produce a WITHHELD score, never a number. If it
//     produced 0, the dashboard would report "clear air" for 572 cameras that
//     are showing nothing at all.
//
// Pure: no network, no ffmpeg, no clock, no database.

import { parseLongdoCameras } from '../server/sources/iticCctv.js'
import { classifyStream, grabUrlFor } from '../server/sources/cctvRegistry.js'
import { coverageReport, REACHABLE_KINDS } from '../server/vision/coverage.js'
import { grabUrlOf } from '../server/vision/frameGrab.js'
import { readFrame, solidFrame } from '../server/vision/hazeRead.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

/** Build a one-item Longdo RSS block so we exercise the real parse path. */
function rss({ camid, hls, img, link }) {
  return `<?xml version="1.0"?><rss><channel><item>
    <title>กล้องทดสอบ</title>
    <camid>${camid}</camid>
    <latitude>13.7563</latitude>
    <longitude>100.5018</longitude>
    <motion>Y</motion>
    <hls_url>${hls}</hls_url>
    <imgurl>${img}</imgurl>
    <link>${link}</link>
    <organization>iTIC</organization>
  </item></channel></rss>`
}

console.log('\n── resolveHls: the double-prefix bug ──')
{
  // This is the exact string the catalogue was serving before the fix.
  const abs = 'https://camerai1.iticfoundation.org/hls/ccs22.m3u8'
  const [cam] = parseLongdoCameras(rss({
    camid: 'ITICM_BMAMI0167', hls: abs,
    img: 'https://camerai1.iticfoundation.org/jpeg/ccs22.jpg',
    link: 'https://live.iticfoundation.org/',
  }))
  check('an absolute iTIC hls_url is returned untouched', cam?.hls_url === abs,
    `got ${cam?.hls_url}`)
  check('the URL is not prefixed with a second /hls/', !/\/hls\/https?:\/\//i.test(cam?.hls_url ?? ''),
    `got ${cam?.hls_url}`)

  const rel = 'ccs30.m3u8'
  const [relCam] = parseLongdoCameras(rss({
    camid: 'ITICM_BMAMI0175', hls: rel,
    img: 'https://camerai1.iticfoundation.org/jpeg/ccs30.jpg',
    link: 'https://live.iticfoundation.org/',
  }))
  check('a RELATIVE path keeps the img host — camerai1, with the i',
    relCam?.hls_url === 'https://camerai1.iticfoundation.org/hls/ccs30.m3u8',
    `got ${relCam?.hls_url}`)

  // The hostname bug: the default and the recogniser both said `camera1`,
  // which 404s. `camerai1` returns 200. A 404 is indistinguishable from dead
  // hardware to the health probe, so this silently marked cameras offline.
  const [noImg] = parseLongdoCameras(rss({
    camid: 'ITICM_BMAMI0176', hls: 'kk26.m3u8',
    img: '', link: 'https://live.iticfoundation.org/',
  }))
  check('a relative path with no img host defaults to camerai1, not camera1',
    noImg?.hls_url === 'https://camerai1.iticfoundation.org/hls/kk26.m3u8',
    `got ${noImg?.hls_url}`)
  check('the default host is the one that actually serves playlists',
    !/camera1\.iticfoundation/.test(noImg?.hls_url ?? ''), `got ${noImg?.hls_url}`)

  const cdn = 'http://180.180.242.207:1935/Phase9/PER_9_027_OUT.stream/playlist.m3u8'
  const [cdnCam] = parseLongdoCameras(rss({
    camid: 'DOH-PER-9-027-out', hls: cdn,
    img: 'https://camerai1.iticfoundation.org/pass/x.jpg',
    link: 'https://live.iticfoundation.org/',
  }))
  check('a raw RTMP/CDN URL still goes through /pass/', 
    cdnCam?.hls_url === 'https://camera1.iticfoundation.org/pass/180.180.242.207:1935/Phase9/PER_9_027_OUT.stream/playlist.m3u8',
    `got ${cdnCam?.hls_url}`)

  const passthru = 'https://camerai1.iticfoundation.org/pass/1.2.3.4:1935/a/b.m3u8'
  const [ptCam] = parseLongdoCameras(rss({
    camid: 'DOH-PER-7-026', hls: passthru,
    img: 'https://camera3.iticfoundation.org/mjpeg.php?camid=PER-7-026',
    link: 'https://live.iticfoundation.org/',
  }))
  check('an existing /pass/ URL is passed through unchanged', ptCam?.hls_url === passthru,
    `got ${ptCam?.hls_url}`)
}

console.log('\n── classifyStream: five kinds, not one bucket ──')
{
  check('hls  ← a .m3u8 playlist',
    classifyStream('https://x.iticfoundation.org/hls/ccs22.m3u8', null) === 'hls')
  check('mjpeg ← an iTIC mjpeg2.php viewer',
    classifyStream(null, 'https://camera1.iticfoundation.org/mjpeg2.php?camid=61.91.182.114:1115') === 'mjpeg')
  check('snapshot ← a BMA PlayVideo page',
    classifyStream(null, 'http://www.bmatraffic.com/PlayVideo.aspx?ID=1264') === 'snapshot')
  check('page ← an NST WHEP embed',
    classifyStream(null, 'https://nstcctv.nakhoncity.org/cam/WL007_sub/') === 'page')
  check('none ← no URL at all', classifyStream(null, null) === 'none')
  check('an hls_url wins over a viewer_url when both exist',
    classifyStream('https://a/b.m3u8', 'https://camera1.iticfoundation.org/mjpeg2.php?camid=1.2.3.4:80') === 'hls')

  check('grab_url is set for hls',
    grabUrlFor({ stream_kind: 'hls', hls_url: 'https://a/b.m3u8' }) === 'https://a/b.m3u8')
  check('grab_url is set for mjpeg (the viewer URL IS the stream)',
    grabUrlFor({ stream_kind: 'mjpeg', viewer_url: 'https://c/mjpeg2.php?camid=1.2.3.4:1' })
      === 'https://c/mjpeg2.php?camid=1.2.3.4:1')
  check('grab_url is null for a blank-snapshot camera — we refuse to spend a spawn',
    grabUrlFor({ stream_kind: 'snapshot', viewer_url: 'http://bmatraffic/x' }) === null)
  check('grab_url is null for a WebRTC page', grabUrlFor({ stream_kind: 'page', viewer_url: 'https://n/cam/' }) === null)

  check('grabUrlOf prefers an explicit grab_url',
    grabUrlOf({ grab_url: 'https://g', hls_url: 'https://h' }) === 'https://g')
  check('grabUrlOf falls back to hls_url for a bare object',
    grabUrlOf({ hls_url: 'https://h' }) === 'https://h')
}

console.log('\n── blank frames must not produce a score ──')
{
  // Measured 2026-09-29: BMA show.aspx returns mean 255, stddev 0.000.
  for (const [name, rgb] of [['white', [255, 255, 255]], ['black', [0, 0, 0]], ['grey', [128, 128, 128]]]) {
    const r = readFrame(solidFrame(...rgb))
    check(`a solid ${name} frame yields a withheld score, not 0`,
      r.ok === true && r.hazeIndex === null, `hazeIndex=${r.hazeIndex}`)
    check(`a solid ${name} frame states why`, /corridor|structure/i.test(r.scoreReason ?? ''),
      `reason=${r.scoreReason}`)
    check(`a solid ${name} frame has no corridor measurement`,
      r.features.corridorTail === null)
  }
}

console.log('\n── coverageReport: the honest accounting ──')
{
  const cat = [
    { source: 'itic', id: 'a', stream_kind: 'hls', stream_status: 'live' },
    { source: 'itic', id: 'b', stream_kind: 'hls', stream_status: 'down' },
    { source: 'itic', id: 'c', stream_kind: 'mjpeg', stream_status: 'embed' },
    { source: 'gistda', id: 'd', stream_kind: 'snapshot', stream_status: 'embed' },
    { source: 'nst', id: 'e', stream_kind: 'page', stream_status: 'embed' },
    { source: 'gistda', id: 'f', stream_kind: 'none', stream_status: 'unknown' },
  ]
  const rep = coverageReport(cat, { grabbedKeys: new Set(['itic:a', 'itic:c']) })
  check('total is the whole catalogue', rep.total === 6, `got ${rep.total}`)
  check('reachable counts HLS, MJPEG and published snapshots', rep.reachable === 4, `got ${rep.reachable}`)
  check('unreachable is the complement', rep.unreachable === 2, `got ${rep.unreachable}`)
  check('a class is only "available" once a frame came out of it',
    rep.classes.find((c) => c.stream_kind === 'mjpeg')?.available === true)
  check('an unprobed mjpeg class is reachable but not yet available',
    coverageReport(cat, { grabbedKeys: new Set(['itic:a']) })
      .classes.find((c) => c.stream_kind === 'mjpeg')?.available === false)
  check('a blank-snapshot class carries a bilingual reason',
    (() => { const c = rep.classes.find((x) => x.stream_kind === 'snapshot')
      return c?.reachable === true && c.available === false && c.why_en && c.why_th.length > 0 })())
  check('a WebRTC page class carries a bilingual reason',
    (() => { const c = rep.classes.find((x) => x.stream_kind === 'page')
      return c?.reachable === false && /WebRTC/i.test(c.why_en) && c.why_th.length > 0 })())
  check('a dead hls class says so rather than claiming unreachable protocol',
    (() => { const c = rep.classes.find((x) => x.stream_status === 'down')
      return c?.reachable === true && c.available === false && c.why_en })())
  check('reachable classes sort above unreachable ones',
    rep.classes[0].reachable === true)
  check('the headline names both numbers',
    /6/.test(rep.headline_en) && /4/.test(rep.headline_en))
  check('pct_reachable is a real percentage', rep.pct_reachable === 66.7, `got ${rep.pct_reachable}`)
  check('snapshots are probeable; WebRTC pages need a different reader',
    REACHABLE_KINDS.has('snapshot') && !REACHABLE_KINDS.has('page'))
  check('an empty catalogue does not divide by zero',
    coverageReport([]).pct_reachable === 0)
}


console.log('\n── the UI can say every reason the API can give ──')
{
  // The server measures WHY a camera has no readable stream (coverage.js
  // UNREACHABLE) and the wall displays it (cctvPlayer.js NO_PICTURE). These
  // are two lists in two files, and nothing in the type system ties them
  // together: a key added to one and not the other renders as the generic
  // "not readable" fallback, which is a silent regression that looks fine.
  const { readFileSync } = await import('node:fs')
  const { UNREACHABLE } = await import('../server/vision/coverage.js')
  const player = readFileSync(new URL('../public/js/layers/cctvPlayer.js', import.meta.url), 'utf8')
  const block = player.match(/const NO_PICTURE = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const uiKeys = [...block.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1])

  check('the UI taxonomy is not empty', uiKeys.length > 0)
  // 'down' is a reachability state, not a stream kind, so the server explains
  // it elsewhere (the link-out branch). The kinds must line up.
  const serverKinds = Object.keys(UNREACHABLE).filter((k) => k !== 'down').sort()
  const missing = serverKinds.filter((k) => !uiKeys.includes(k))
  check('every unreachable stream_kind has a message the UI can show',
    missing.length === 0, `UI is missing: ${missing.join(', ')}`)
  check('the UI does not invent reasons the server never emits',
    uiKeys.every((k) => serverKinds.includes(k)),
    `UI has extra: ${uiKeys.filter((k) => !serverKinds.includes(k)).join(', ')}`)
  check('each UI reason is bilingual', [...block.matchAll(/th: '([^']+)'[\s\S]{0,80}?en: '([^']+)'/g)]
    .every((m) => m[1].length > 0 && m[2].length > 0))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
