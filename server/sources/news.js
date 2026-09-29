// Air-quality news: Google News RSS (Thai PM2.5/haze query) + Khaosod general
// feed filtered to dust keywords. Tiny regex RSS parser — feeds are simple RSS 2.0.
import { CONFIG } from '../config.js'
import { fetchText, str } from '../util.js'
import { geotagHeadline } from '../newsPlaces.js'

const FEEDS = [
  {
    id: 'gnews_air',
    // Query: ฝุ่น PM2.5 OR หมอกควัน OR ค่าฝุ่น
    url: 'https://news.google.com/rss/search?q=%E0%B8%9D%E0%B8%B8%E0%B9%88%E0%B8%99%20PM2.5%20OR%20%E0%B8%AB%E0%B8%A1%E0%B8%AD%E0%B8%81%E0%B8%84%E0%B8%A7%E0%B8%B1%E0%B8%99%20OR%20%E0%B8%84%E0%B9%88%E0%B8%B2%E0%B8%9D%E0%B8%B8%E0%B9%88%E0%B8%99&hl=th&gl=TH&ceid=TH:th',
    preFiltered: true,
  },
  { id: 'khaosod', url: 'https://www.khaosod.co.th/feed', preFiltered: false },
]

const AIR_KEYWORDS = ['pm2.5', 'pm 2.5', 'pm10', 'ฝุ่น', 'หมอกควัน', 'ค่าฝุ่น', 'คุณภาพอากาศ', 'เผา', 'ไฟป่า', 'จุดความร้อน', 'haze', 'air quality', 'smog']

// Subset of AIR_KEYWORDS that specifically names an open-burning/fire source
// (as opposed to just discussing the resulting dust) — these get the red
// "fire" map-marker treatment. Deliberately NOT the bare verb "เผา" ("to
// burn") — it's Thai's everyday word for burning anything (cremation, crime
// reporting, cooking) and matches far too much unrelated news; only the
// compound forms below are specific to open burning / wildfire. Checked
// against the raw (non-lowercased) title for the Thai terms since Thai has
// no case; the English ones are checked against the lowercased string.
const FIRE_KEYWORDS = [
  'ไฟป่า', 'ไหม้ป่า', 'จุดความร้อน', 'เผาป่า', 'เผาไร่', 'เผาตอซัง', 'เผาในที่โล่ง',
  'wildfire', 'hotspot', 'open burning', 'agricultural burning',
]

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim()
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1]) : null
}

export function parseRss(xml) {
  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]
    const title = tag(block, 'title')
    const link = tag(block, 'link')
    const guid = tag(block, 'guid') ?? link
    const pubDate = tag(block, 'pubDate')
    if (title && guid) items.push({ title, link, guid, pubDate })
  }
  return items
}

export default {
  name: 'news',
  label_th: 'ข่าวฝุ่น/คุณภาพอากาศ',
  label_en: 'Air quality news',
  intervalMs: CONFIG.intervals.news,
  enabled: true,
  // 2: headlines are geotagged with newsPlaces (every place named, ambiguous
  // Thai words refused) instead of a single substring match. Bumping this
  // runs the source on the next boot so stored rows get retagged.
  version: 2,

  async run({ db, bus }) {
    retagStored(db)
    const fetched_at = new Date().toISOString()
    let seen = 0, added = 0
    const fresh = []

    const results = await Promise.allSettled(FEEDS.map((f) => fetchText(f.url)))
    let anyOk = false

    results.forEach((res, i) => {
      if (res.status !== 'fulfilled') return
      anyOk = true
      const feed = FEEDS[i]
      const items = parseRss(res.value)

      for (const item of items) {
        if (!feed.preFiltered && !AIR_KEYWORDS.some((k) => item.title.toLowerCase().includes(k))) continue
        seen += 1
        const published = item.pubDate ? new Date(item.pubDate) : null
        // Scheme-validate the link at ingest: a spoofed/compromised feed
        // could supply javascript: URIs that the frontend would set as
        // href verbatim. Only http(s) links are stored.
        const rawLink = str(item.link)
        const safeLink = rawLink && /^https?:\/\//i.test(rawLink) ? rawLink : null
        // Every place the headline names (server/newsPlaces.js). The first
        // place is the row's pin; places_json keeps the rest so a story
        // about three provinces is not drawn as one.
        const titleLower = item.title.toLowerCase()
        const geo = geotagHeadline(item.title)
        const isFire = FIRE_KEYWORDS.some((k) => titleLower.includes(k))
        const isNew = db.insertNews({
          feed: feed.id,
          guid: item.guid,
          title: item.title,
          link: safeLink,
          published_at: published && !Number.isNaN(+published) ? published.toISOString() : null,
          fetched_at,
          province_code: geo.province_code,
          province_th: geo.province_th,
          province_en: geo.province_en,
          lat: geo.lat,
          lng: geo.lng,
          is_fire: isFire,
          places_json: JSON.stringify(geo.places),
        })
        if (isNew) { added += 1; fresh.push(item.title) }
      }
    })

    if (!anyOk) throw new Error('all news feeds failed')

    for (const title of fresh.slice(0, 5)) {
      bus.publish({
        kind: 'news', source: 'news', severity: 0,
        title_th: title, title_en: title, // Thai-language headlines pass through
        payload: null,
      })
    }

    return { seen, added }
  },
}

// Rows ingested before newsPlaces stored a single substring hit, and short
// Thai words (เลย, ตาก, พล) could pin the wrong province. A null places_json
// means "not yet read by this matcher". Empty array means "read, no place".
// The archive is a few hundred headlines. One pass on the boot that picks
// up version 2 retags them; after that the query matches nothing.
function retagStored(db) {
  let rows
  try {
    rows = db.all(
      `SELECT id, title FROM news_items
       WHERE places_json IS NULL AND title IS NOT NULL
       ORDER BY id DESC LIMIT 1000`)
  } catch { return 0 }
  if (!rows?.length) return 0
  db.tx(() => {
    for (const row of rows) {
      const g = geotagHeadline(row.title)
      db.run(
        `UPDATE news_items
         SET province_code=?, province_th=?, province_en=?, lat=?, lng=?, places_json=?
         WHERE id=?`,
        g.province_code, g.province_th, g.province_en, g.lat, g.lng,
        JSON.stringify(g.places), row.id)
    }
  })
  return rows.length
}
