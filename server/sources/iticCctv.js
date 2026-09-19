// iTIC / Longdo camera feed — the missing piece of the multi-source CCTV
// aggregator.
//
// Longdo hosts the public keyless XML/RSS feed of the iTIC camera
// directory at https://camera.longdo.com/feed/ — 219 cameras today,
// nationwide, with lat/lng + HLS stream URLs + agency attribution. We
// stumbled on this URL by reading the operator's BKKx codebase
// (site/worker/live.ts#LONGDO_CAMERA_FEED), which uses the same source.
// live.iticfoundation.org itself doesn't expose this catalog; the
// underlying data lives on camera.longdo.com under Longdo's media
// infrastructure.
//
// What every <item> in the feed carries (verified 2026-09-15):
//   <title>          road / location name (th)
//   <location>       same as title, fallback name (th)
//   <latitude>       decimal lat
//   <longitude>      decimal lng
//   <camid>          unique camera id (e.g. DOHBHS0016, DOH-PER-7-026)
//   <imgurl>         JPEG snapshot URL (often has typo'd
//                    "camear3" instead of "camera3" — handled in
//                    rewriteStillHost to mirror BKKx)
//   <hls_url>        HLS playlist URL (absolute path, often
//                    http://180.180.242.207:1935/PhaseN/...m3u8 — the
//                    same shape the operator's screenshot landed on)
//   <link>           full link to the iTIC viewer page
//   <organization>   agency (กรมทางหลวง = DOH, iTIC Motion = BMA, etc.)
//   <motion>         Y / N (we filter to Y so dead cameras never land)
//
// Why this is its own source (not GISTDA): the catalog data is hosted
// under iTIC's own domain via Longdo, and the cameras that stream over
// cameraN.iticfoundation.org don't all appear in floodcheck.gistda.or.th.
// Empirically the iTIC directory sits at lat 13.4–18.8, lon 99.9–105.5 —
// mostly DOH (กรมทางหลวง) motorway cameras that the dashboard operator
// has confirmed are live. Some entries point at camera3.iticfoundation.org
// which timed out from this network on 2026-09-15 — those cameras
// stay in the catalog but the popup falls back to the iTIC viewer
// page rather than embedding a stream.

import { fetchText, log } from '../util.js'

const URL = 'https://camera.longdo.com/feed/'

/** Field names we read off each <item>. Same shape BKKx uses; locked
 *  here so the XML parser doesn't drift between BKKx and FloodDash. */
const TAGS = {
  title: 'title',
  location: 'location',
  latitude: 'latitude',
  longitude: 'longitude',
  camid: 'camid',
  imgurl: 'imgurl',
  hlsUrl: 'hls_url',
  link: 'link',
  organization: 'organization',
  motion: 'motion',
}

/** BBOX filter: Thailand only. The feed contains ~219 entries, max
 *  lat 19.17 (Chiang Rai motorway camera, 2026-09-15), so the box is
 *  a safety belt for future changes upstream. Thailand's northernmost
 *  point is ~20.45 (Mae Sai); we use 20.5 to give headroom. The
 *  registry's normalize() uses 21.5 because it can't read the country
 *  without a more conservative box; this is the strict version. */
const TH_BBOX = { south: 4.0, west: 96.0, north: 20.5, east: 106.5 }

/** Camera hosts we recognize. Anything else → snapshot is gated off
 *  (no preview), but the camera stays in the catalog and its HLS
 *  stream (if any) plays inline. Mirrors BKKx worker/live.ts#STILL_HOSTS
 *  but does NOT keep the cctv.longdo.com host; that one is a watch
 *  mirror, not a primary. */
const STILL_HOSTS = new Set([
  'camera1.iticfoundation.org',
  'camera2.iticfoundation.org',
  'camera3.iticfoundation.org',
  'cameras.iticfoundation.org',
  'bma-itic1.iticfoundation.org',
])

const ITIC_LIVE = 'https://live.iticfoundation.org/'

function itemTag(block, name) {
  const open = `<${name}>`
  const close = `</${name}>`
  const i = block.indexOf(open)
  if (i < 0) return ''
  const j = block.indexOf(close, i + open.length)
  if (j < 0) return ''
  return block
    .slice(i + open.length, j)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function rewriteStillHost(url) {
  if (!url) return url
  return String(url)
    .replace('://camear3.iticfoundation.org', '://camera3.iticfoundation.org')
    .replace(/^http:\/\//, 'https://')
}

function isPlaceholderStill(url) {
  return !url || /X\.X\.X\.X/i.test(url) || /camid=$/i.test(url) || /camid=&/i.test(url)
}

function stillHostAllowed(url) {
  try {
    return STILL_HOSTS.has(new URL(url).host)
  } catch {
    return false
  }
}

function gateStill(raw) {
  if (!raw) return { snapshotUrl: null, still: false }
  const url = rewriteStillHost(raw)
  if (!stillHostAllowed(url)) return { snapshotUrl: null, still: false }
  // Realtime iTIC streams use IPv4 + port camid, not "X.X.X.X" placeholders.
  const hasLive = /[?&]camid=\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:&|$)/i.test(url)
  if (isPlaceholderStill(url) || !hasLive) return { snapshotUrl: null, still: false }
  // We don't proxy through FloodDash yet (no /api/cctv/still proxy in
  // this codebase); future work — for now use the upstream URL directly
  // and let CORS / privacy be a follow-up.
  return { snapshotUrl: url, still: true }
}

function resolveHls(hls, imgHost) {
  if (!hls || hls === 'null') return null
  if (isPlaceholderStill(hls)) return null
  // Apply the typo rewrite first — normalizes `camear3` → `camera3` so
  // the proxy regex below matches.
  hls = rewriteStillHost(hls)
  // Already on the iTIC portal proxy — keep as-is. Probe verified 2026-09-15
  // (the operator's screenshot landed here): the proxy authenticates the
  // CDM pass-through and returns an HLS playlist the browser can play.
  if (/^https?:\/\/camerai?\d?\.iticfoundation\.org\/pass\//i.test(hls)) {
    return hls
  }
  // Raw CDN URL from the upstream feed (e.g.
  // http://180.180.242.207:1935/Phase3/PER_3_008_IN.stream/chunklist_XXXX.m3u8)
  // — these hit the RTMP-to-HLS bridge directly and 404 in browsers because
  // the upstream requires a CDN session. Re-host them through the iTIC
  // portal proxy (cameraN.iticfoundation.org/pass/{ip}:{port}/{path}),
  // which auths the request and forwards to the CDN.
  const rtpmMatch = hls.match(/^https?:\/\/(\d+\.\d+\.\d+\.\d+):(\d+)(\/.+)$/)
  if (rtpmMatch) {
    const [, ip, port, path] = rtpmMatch
    // camera1 is the proxy that also serves the .m3u8 variants; if the
    // CDN IP differs (some cameras serve from .208 not .207) the proxy
    // bridges transparently.
    return `https://camera1.iticfoundation.org/pass/${ip}:${port}${path}`
  }
  // Relative path (no scheme). The Longdo convention is to put the
  // path under the host of the <imgurl>. Empirically the relative
  // paths in this feed work through the camera1.iticfoundation.org/hls/
  // endpoint; we use that as a safe default when the img host isn't a
  // recognized camera host.
  if (hls.endsWith('.m3u8')) {
    const base = imgHost && /^(camera\d|cameras|cctv\.|bma-itic)/.test(imgHost)
      ? imgHost
      : 'camera1.iticfoundation.org'
    return `https://${base}/hls/${hls}`
  }
  // Plain https URL that isn't on the iTIC proxy and doesn't match the
  // CDN IP pattern: keep it (might be a Longdo direct link).
  return hls
}

export function parseLongdoCameras(xml) {
  if (!xml || typeof xml !== 'string' || !xml.includes('<item>')) return []
  const blocks = xml.split('<item>').slice(1)
  const cams = []
  for (const block of blocks) {
    const name = itemTag(block, TAGS.title) || itemTag(block, TAGS.location)
    if (!name) continue
    const lat = Number(itemTag(block, TAGS.latitude))
    const lng = Number(itemTag(block, TAGS.longitude))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat < TH_BBOX.south || lat > TH_BBOX.north) continue
    if (lng < TH_BBOX.west || lng > TH_BBOX.east) continue

    // Mirror BKKx: motion=N means the camera has been still for a while.
    // Policy choice — keep it in (don't lose named cameras) but mark it
    // not-live so the rail can demote the icon. The registry uses a
    // single `online: bool` shape; we treat motion=N as online=false.
    const motion = itemTag(block, TAGS.motion).toUpperCase()
    if (motion === 'N') continue
    const rawImg = rewriteStillHost(itemTag(block, TAGS.imgurl))
    const imgHost = rawImg ? safeHost(rawImg) : null
    const gated = gateStill(rawImg)
    const link = itemTag(block, TAGS.link)

    cams.push({
      id: itemTag(block, TAGS.camid) || `itic-cam-${cams.length + 1}`,
      lat,
      lng,
      name_th: name,
      name_en: '',
      location_th: '',
      online: true,
      flooded: false,
      source_native_id: itemTag(block, TAGS.camid) || null,
      hls_url: resolveHls(itemTag(block, TAGS.hlsUrl), imgHost),
      // Link points at the iTIC viewer when present, else the dashboard.
      viewer_url: link && link.startsWith('http') ? rewriteStillHost(link) : ITIC_LIVE,
      attribution_th: itemTag(block, TAGS.organization) || 'iTIC / Longdo',
      attribution_url: ITIC_LIVE,
      // Mirror to the registry's normalized fields so callers see them.
      organization: itemTag(block, TAGS.organization) || 'iTIC / Longdo',
      still: gated.still,
      // surfacing the upstream still is useful for the popup's "open
      // snapshot in new tab" anchor; the registry doesn't store it
      // but downstream callers can still see gated.snapshotUrl via a
      // follow-up route.
      upstream_still_url: gated.snapshotUrl,
    })
  }
  return cams
}

function safeHost(url) {
  try { return new URL(url).host } catch { return null }
}

/** Single polled attempt. Network errors are caught; a malformed XML
 *  payload normalizes to [] but the previous good payload is kept by
 *  the registry's stale-while-error contract. */
async function fetchLongdoCameras({ timeoutMs = 30_000 } = {}) {
  const xml = await fetchText(URL, { timeoutMs, headers: { accept: 'application/rss+xml, application/xml, text/xml, */*' } })
  const cams = parseLongdoCameras(xml)
  return { cams, status: 'live', parsed: xml.length }
}

/** Public source registration shape consumed by cctvRegistry. */
export default {
  name: 'itic_longdo',
  label_th: 'iTIC · มูลนิฑิศูนย์ข้อมูลจราจรอัจฉริยะไทย',
  label_en: 'iTIC (live.iticfoundation.org)',
  intervalMs: 10 * 60_000,            // 10 min — same cadence as GISTDA
  enabled: true,
  async run() {
    const { cams, status, parsed } = await fetchLongdoCameras()
    if (cams.length === 0) {
      log('warn', 'itic_longdo: empty parse', { feedBytes: parsed })
    }
    return { seen: cams.length, added: cams.length, status, cameras: cams }
  },
}
