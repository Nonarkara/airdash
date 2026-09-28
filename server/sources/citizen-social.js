// Citizen and social haze reports, pinned to the map.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
// ---------------------------------------------
// The ask was for a social-media scraping system that pins citizens' reports
// to the map automatically, the way FloodDash does. FloodDash has that: an
// Apify lane that scrapes Facebook and Instagram (paid, third-party) and an
// RSS lane for news (free). This implements the RSS lane for air, and takes
// FloodDash's constraint as binding rather than as a starting suggestion —
// its own schema comment says, verbatim:
//
//   "The free RSS lane (scripts/citizen-social) may insert credited news
//    tips. It does not scrape Facebook or Instagram."
//
// That is the right call and this file keeps it. Facebook scraping means a
// paid actor account, a standing ToS violation, and a pipeline that breaks
// when Facebook changes a selector. It also produces exactly the thing that
// makes a public-health map untrustworthy: unattributed posts pinned at
// confident-looking coordinates. So: published RSS only, every row carrying
// the publisher's name and the post's own URL, and a schema that REFUSES a
// row with an empty credit line.
//
// The Apify lane remains the upgrade path. It is a config change here, not a
// rewrite — a fetcher returns {title, url, id, credit}, and both lanes go
// through the same normalise() below.
//
// WHY PINS FADE
// -------------
// status 'live' rows expire. A haze map accumulates garbage otherwise: a
// report from the 2023 season is not news, and leaving it on the map teaches
// people to ignore the layer. The expiry is per-source-urgency rather than a
// single global constant — a "PM2.5 crossed 75" post stays useful for days, a
// "haze is bad right now" post for hours.
//
// HAZE NEEDS A CLAIM LABEL, NOT JUST A PIN
// -----------------------------------------
// "หมอกควัน" and "ฝุ่น" both translate to "haze" and mean opposite things to
// a citizen. ฝุ่น is combustion — a fire is burning somewhere, look upwind.
// ฝน/ฝนพิชั่น clearing it is ฝน, and the Rain-Washout engine is about to
// change the answer. Pinning both as undifferentiated "haze" would make the
// layer useless exactly when someone needs to decide whether to stay inside
// or go look at the fire map. claims_json records what the text actually
// claimed, and the map draws the claim, not just the dot.

import { CONFIG } from '../config.js'
import { log } from '../util.js'
import { geocodePlace, CONFIDENCE, PIN_PRECISION } from '../socialGeocode.js'
import { createHash } from 'node:crypto'

/**
 * The feed list. Kept here rather than in config.json because each entry
 * carries a credit line that must be edited by a human alongside the URL, and
 * a human editing a config file is a human who will not break the shape.
 *
 * `air` terms are the ones that make something a HAZE report. The list is
 * deliberately narrow: a general news feed mentions ฝุ่น constantly, and
 * pinning every editorial about national PM2.5 policy produces a map of
 * newsroom positions rather than a map of air.
 */
// Every URL here was fetched and confirmed to return real items on
// 2026-09-28. Four candidates were dropped for returning no <item> elements:
// PRD's Thailand feed 302s, phys.org's earth-news feed 400s (their whole
// /rss-feed/ tree did), Thai PBS and Post Today return empty bodies, and
// rsshub.app 403s. An empty feed is worse than no feed here, because it looks
// configured and silently contributes nothing.
// Every URL was fetched and confirmed to return real <item> elements on
// 2026-09-28. Fourteen candidates were dropped: thairath's category feeds and
// matichon's environment feed 404/403, Thai PBS, Dailynews, Sanook, Spring
// News, Nation and the Guardian's non-forest desks return empty bodies, and
// phys.org's entire /rss-feed/ tree 400s. An empty feed is worse than no
// feed: it looks configured and silently contributes nothing.
//
// The general-news feeds alone yielded ZERO pins over 240 items, which is the
// honest result rather than a bug: on a day with no haze, a national front
// page simply does not report Thai air quality, and a feed class of "any
// Thai news" mostly produces newsroom policy stories rather than
// observations. The environment and climate desks below are the ones that
// carry place-anchored reporting.
const FEEDS = [
  {
    id: 'thai_rss:matichon',
    name_th: 'มติชนออนไลน์',
    credit: 'Matichon Online, public RSS',
    url: 'https://www.matichon.co.th/feed',
    lang: 'th',
  },
  {
    id: 'thai_rss:thairath',
    name_th: 'ไทยรัฐ',
    credit: 'Tha Rath (สำนักพิมพ์แห่งชาติ), public RSS',
    url: 'https://www.thairath.co.th/rss/news',
    lang: 'th',
  },
  {
    id: 'thai_rss:prachachat',
    name_th: 'ประชาชาติธุรกิจ',
    credit: 'Prachachat (กรุงเทพธุรกิจ), public RSS',
    url: 'https://www.prachachat.net/feed',
    lang: 'th',
  },
  {
    id: 'thai_rss:thestandard',
    name_th: 'THE STANDARD',
    credit: 'The Standard, public RSS',
    url: 'https://thestandard.co/feed/',
    lang: 'th',
  },
  {
    id: 'en_rss:sciencedaily_air',
    name_th: 'ScienceDaily — คุณภาพอากาศ',
    credit: 'ScienceDaily (air quality desk), public RSS',
    url: 'https://www.sciencedaily.com/rss/earth_climate/air_quality.xml',
    lang: 'en',
  },
  {
    id: 'en_rss:volcanoes',
    name_th: 'ScienceDaily — ภูเขาไฟ',
    credit: 'ScienceDaily (volcanoes desk), public RSS — volcanic SO2 reaches Thai airspace every few years',
    url: 'https://www.sciencedaily.com/rss/earth_climate/volcanoes.xml',
    lang: 'en',
  },
  {
    id: 'en_rss:climate',
    name_th: 'ScienceDaily — ภูมิอากาศ',
    credit: 'ScienceDaily (earth & climate desk), public RSS',
    url: 'https://www.sciencedaily.com/rss/earth_climate.xml',
    lang: 'en',
  },
  {
    id: 'en_rss:un_climate',
    name_th: 'สหประชาชาติ — การเปลี่ยนแปลงสภาพภูมิอากาศ',
    credit: 'UN News Climate Change, public RSS',
    url: 'https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml',
    lang: 'en',
  },
  {
    id: 'en_rss:guardian_forests',
    name_th: 'The Guardian — ป่าและไฟป่า',
    credit: 'The Guardian Environment (forests), public RSS',
    url: 'https://www.theguardian.com/environment/forests/rss',
    lang: 'en',
  },
  {
    id: 'en_rss:climate_crisis',
    name_th: 'The Guardian — วิกฤตภูมิอากาศ',
    credit: 'The Guardian Environment (climate crisis), public RSS',
    url: 'https://www.theguardian.com/environment/climate-crisis/rss',
    lang: 'en',
  },
  {
    id: 'en_rss:mongabay',
    name_th: 'Mongabay',
    credit: 'Mongabay (environmental news), public RSS',
    url: 'https://news.mongabay.com/feed/',
    lang: 'en',
  },
  {
    id: 'en_rss:aljazeera',
    name_th: 'Al Jazeera',
    credit: 'Al Jazeera, public RSS',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    lang: 'en',
  },
]

/** Thai and English terms that mean "this report is about the air".
 *
 *  NOT the bare word ฝุ่น. Thai ฝุ่น is polysemous: it is both "air
 *  pollution" and "medal dust" — ไต้ฝุ่น is "to win a medal", and ไต้ฝุ่น
 *  ชายไทยเฮ ("the Thai men win bronze") is a SPORTS headline. A filter
 *  keyed on the bare word matched two Asian-Games stories out of 420 items
 *  and neither was about air. The geocoder happened to reject both for
 *  naming no place, but that was luck, not design. So the Thai list uses
 *  phrases that only occur in the air sense:
 *
 *      ค่าฝุ่น      the dust LEVEL       ฝุ่นพิษ      toxic dust
 *      ตรวจวัดฝุ่น   monitoring          อากาศเป็นพิษ  toxic air
 *      ฝุ่นละออง    airborne particles   หมอกควัน     smog
 *      ไฟป่า/ไฟป่าไหม้  forest fire      ฝนพิชั่น     rain that clears it
 *
 *  PM2.5 and the English terms are unambiguous and stay as bare words.
 */
/** How long a pin from a feed stays live. Thai front-page stories go stale in
 *  days; the international climate desks carry reporting that stays true, so
 *  they stay longer. A haze map that only ever grows teaches people to ignore
 *  the layer, so pins expire and the map returns to empty. */
const LIVE_HOURS = {
  'thai_rss:matichon': 72, 'thai_rss:thairath': 72,
  'thai_rss:prachachat': 72, 'thai_rss:thestandard': 72,
  'en_rss:sciencedaily_air': 336, 'en_rss:volcanoes': 336, 'en_rss:climate': 336,
  'en_rss:un_climate': 336, 'en_rss:guardian_forests': 336,
  'en_rss:climate_crisis': 336, 'en_rss:mongabay': 336, 'en_rss:aljazeera': 336,
}

export const AIR_TERMS = [
  'ค่าฝุ่น', 'ฝุ่นพิษ', 'ตรวจวัดฝุ่น', 'ฝุ่นละออง', 'อากาศเป็นพิษ', 'หมอกควัน',
  'ไฟป่า', 'ไฟป่าไหม้', 'ฝนพิชั่น', 'ฝนกระชับ', 'มาตรฐานฝุ่น', 'ชั้นฝุ่น',
  'pm2.5', 'pm10',
  'air pollution', 'haze', 'aerosol', 'wildfire smoke', 'particulate',
  'smog', 'air quality', 'fine particles', 'soot',
]

/**
 * Claim extraction, LONGEST MATCH FIRST - and the order matters for the same
 * reason it matters in the geocoder.
 *
 * The first version tested each claim's terms independently, and
 *
 *     "ค่าฝุ่นเชียงใหม่ลดลง ฝนพิชั่นจะล้างหมอกควัน"
 *
 * came back flagged smoke:true, fog:true AND washout:true. It is none of
 * those three in the way the layer means. หมอกควัน is SMOG - one compound
 * word that happens to be spelled as two of our terms, fog plus smoke, with
 * a meaning that is neither. And ฝนพิชั่น is the opposite of smoke: rain
 * that will clear it.
 *
 * So a compound is matched first and its characters are CONSUMED, so its
 * parts can no longer match inside it. Same "longest match wins" rule as the
 * geocoder, for the same reason: in a logographic script a substring match
 * finds a word inside a different word.
 */
/** Minimal RSS/Atom item extraction. Deliberately regex-based rather than a
 *  real XML parser: this project has zero npm dependencies, feed items are
 *  simple, and a malformed item is dropped rather than trusted. */
function parseItems(xml) {
  const items = []
  const blocks = [
    ...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ]
  for (const m of blocks) {
    const b = m[0]
    const pick = (tag) => {
      const t = b.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]
      return t ? decodeEntities(stripCdata(t)).trim() : null
    }
    const title = pick('title')
    if (!title) continue
    let link = pick('link')
    if (!link) link = b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? null
    const pub = pick('pubDate') ?? pick('published') ?? pick('updated') ?? pick('dc:date')
    const desc = pick('description') ?? pick('summary') ?? pick('content') ?? ''
    const guid = pick('guid') ?? pick('id')
    items.push({ title, link: link ? decodeEntities(link).trim() : null, pub, desc, guid })
  }
  return items
}
const stripCdata = (t) => String(t).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
const decodeEntities = (t) => String(t)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&')

/** Exposed for the unit tests: the parser, with no network. */
export const parseFeedForTest = (xml) => parseItems(xml)

const hasAir = (text) => {
  const t = String(text).toLowerCase()
  return AIR_TERMS.some((k) => t.includes(k.toLowerCase()))
}

const CLAIM_COMPOUNDS = [
  ['หมอกควัน', 'smoke', ['fog']],
  ['ฝุ่นพิษ', 'dust', []],
  ['ฝนพิชั่น', 'washout', ['smoke']],
  ['ฝนกระชับ', 'washout', []],
  ['ไฟป่าไหม้', 'smoke', []],
  ['พายุทราย', 'dust', []],
  ['wildfire smoke', 'smoke', []],
  ['dust storm', 'dust', []],
]

const CLAIM_PARTS = {
  smoke: ['ควัน', 'ไฟป่า', 'ไฟไหม้', 'เผา', 'smoke', 'wildfire', 'burning', 'haze', 'soot'],
  dust: ['ฝุ่นทราย', 'ทราย', 'พายุทราย', 'dust'],
  fog: ['หมอก', 'fog', 'mist'],
  washout: ['ฝนพิชั่น', 'ฝนกระชับ', 'ฝนล้าง', 'จะล้าง', 'will clear', 'rain will', 'scattered rain'],
}

/** Pure: text -> which claims it makes, with compounds consuming their parts. */
export function extractClaims(text) {
  let t = String(text ?? '').toLowerCase()
  const claims = { smoke: false, dust: false, fog: false, washout: false }

  // 1. Compounds first, longest first, consuming the matched span.
  const comps = [...CLAIM_COMPOUNDS].sort((a, b) => b[0].length - a[0].length)
  for (const [phrase, claim, suppress] of comps) {
    const p = phrase.toLowerCase()
    let idx
    while ((idx = t.indexOf(p)) !== -1) {
      claims[claim] = true
      for (const sup of suppress) claims[sup] = false
      // Consume it so its parts cannot match inside it.
      t = t.slice(0, idx) + ' '.repeat(p.length) + t.slice(idx + p.length)
    }
  }
  // 2. Then standalone parts.
  for (const [claim, terms] of Object.entries(CLAIM_PARTS)) {
    if (claims[claim]) continue
    if (terms.some((term) => t.includes(term.toLowerCase()))) claims[claim] = true
  }
  return claims
}

/** Pure: stable id so a re-run does not duplicate a post. */
export const reportId = (source, guidOrLink) =>
  createHash('sha1').update(`${source}|${guidOrLink ?? ''}`).digest('hex').slice(0, 16)

/** Pure: one parsed item → a DB row, or null if it is not a haze report or
 *  names no place. Every rejection is a reason string so a caller can count
 *  why the yield was low instead of guessing. */
export function normalizeItem(item, feed) {
  const text = `${item.title} ${item.desc ?? ''}`.trim()
  if (!hasAir(text)) return { row: null, why: 'not about air' }
  if (!item.link) return { row: null, why: 'no source url — cannot be credited' }
  // Match only names written in the feed's own language. Without this,
  // an English ScienceDaily article gets pinned to a Thai tambon whose name is
  // the transliteration of an ordinary English word.
  const g = geocodePlace(text, { lang: feed.lang })
  if (!g.ok) return { row: null, why: `no place: ${g.reason}` }
  const claims = extractClaims(text)
  return {
    row: {
      id: reportId(feed.id, item.guid ?? item.link),
      source: feed.id,
      source_url: item.link,
      title_raw: item.title,
      lang: feed.lang,
      credit_line: feed.credit,
      lat: g.lat,
      lng: g.lng,
      place_name: g.name_th ?? g.name_en,
      place_kind: g.kind,
      province_code: g.province_code,
      geocode_confidence: g.confidence,
      pin_precision: g.pin_precision,
      matched_text: g.matched,
      claims_json: JSON.stringify(claims),
      created_at: item.pub ? safeDate(item.pub) : new Date().toISOString(),
      live_expires_at: new Date(Date.now() + (LIVE_HOURS[feed.id] ?? 72) * 3600_000).toISOString(),
    },
    why: null,
    geocode: g,
    claims,
  }
}

/** RSS dates are messy. A post with an unparseable date gets the fetch time
 *  rather than being dropped — an old post is still a real post. */
function safeDate(s) {
  const ms = Date.parse(String(s))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString()
}

export default {
  name: 'citizen_social',
  label_th: 'รายงานหมอกควันจากผู้ใช้และสื่อ (RSS สาธารณะ)',
  label_en: 'Citizen and press haze reports (public RSS)',
  intervalMs: CONFIG.intervals.citizen_social ?? 20 * 60_000,
  enabled: true,
  version: 5,

  async run({ db }) {
    let seen = 0, added = 0
    const why = {}

    // Expire old pins before adding, so the layer does not grow without bound.
    db.run(`UPDATE citizen_haze_reports
            SET status = 'archived', archived_reason = 'expired'
            WHERE status = 'live' AND live_expires_at IS NOT NULL AND live_expires_at < ?`,
      new Date().toISOString())

    for (const feed of FEEDS) {
      let xml
      try {
        const res = await fetch(feed.url, {
          signal: AbortSignal.timeout(20_000),
          headers: { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8' },
        })
        if (!res.ok) { why[`${feed.id}:http${res.status}`] = 1; continue }
        xml = await res.text()
      } catch (e) {
        why[`${feed.id}:fetch`] = 1
        log('warn', 'citizen_social feed unreachable', { feed: feed.id, error: String(e).slice(0, 120) })
        continue
      }
      const items = parseItems(xml)
      seen += items.length
      for (const item of items) {
        const { row, why: w } = normalizeItem(item, feed)
        if (!row) { why[w] = (why[w] ?? 0) + 1; continue }
        // Pair with the ground reading already in the DB. The report says the
        // air looks bad somewhere; the station says how bad, in µg/m³, which
        // is the number a citizen actually wants.
        const near = db.get(
          `SELECT s.station_key, s.lat, s.lng, pm.value AS pm25, pm.obs_time
           FROM stations s
           JOIN latest pm ON pm.source = s.source AND pm.station_key = s.station_key AND pm.metric = 'pm25'
           WHERE s.source = 'air4thai'
           ORDER BY (s.lat - ?) * (s.lat - ?) + (s.lng - ?) * (s.lng - ?) ASC
           LIMIT 1`, row.lat, row.lat, row.lng, row.lng)
        const km = near ? haversineKm(row.lat, row.lng, near.lat, near.lng) : null
        // Only pair when it is genuinely near. A province-centroid pin can be
        // 100 km from the nearest station, and calling that "the PM2.5 there"
        // would be a lie with a number attached.
        if (near && km !== null && km <= 60) {
          row.pm25_nearby = near.pm25
          row.pm25_km = Math.round(km * 10) / 10
          row.pm25_band = bandFor(near.pm25)
        }
        if (db.run(
          `INSERT INTO citizen_haze_reports
             (id, source, source_url, title_raw, lang, credit_line, lat, lng,
              place_name, place_kind, province_code, geocode_confidence,
              pin_precision, matched_text, claims_json,
              pm25_nearby, pm25_km, pm25_band, status, live_expires_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'live',?,?)
           ON CONFLICT(id) DO NOTHING`,
          row.id, row.source, row.source_url, row.title_raw, row.lang, row.credit_line,
          row.lat, row.lng, row.place_name, row.place_kind, row.province_code,
          row.geocode_confidence, row.pin_precision, row.matched_text, row.claims_json,
          row.pm25_nearby ?? null, row.pm25_km ?? null, row.pm25_band ?? null,
          row.live_expires_at, row.created_at)) added++
      }
    }
    log('info', 'citizen_social ingested', { seen, added, rejected: why })
    return { seen, added }
  },
}

const haversineKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
const bandFor = (v) =>
  v <= 15 ? 'good' : v <= 25 ? 'moderate' : v <= 37.5 ? 'sensitive' : v <= 75 ? 'unhealthy' : 'hazardous'
