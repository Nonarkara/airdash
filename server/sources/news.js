// Flood news: Google News RSS (Thai flood query) + Khaosod general feed
// filtered to flood keywords. Tiny regex RSS parser — feeds are simple RSS 2.0.
import { CONFIG } from '../config.js'
import { fetchText, str } from '../util.js'

const FEEDS = [
  {
    id: 'gnews_flood',
    url: 'https://news.google.com/rss/search?q=%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B8%97%E0%B9%88%E0%B8%A7%E0%B8%A1%20OR%20%E0%B8%AD%E0%B8%B8%E0%B8%97%E0%B8%81%E0%B8%A0%E0%B8%B1%E0%B8%A2&hl=th&gl=TH&ceid=TH:th',
    preFiltered: true, // query itself is น้ำท่วม OR อุทกภัย
  },
  { id: 'khaosod', url: 'https://www.khaosod.co.th/feed', preFiltered: false },
]

const FLOOD_KEYWORDS = ['น้ำท่วม', 'อุทกภัย', 'น้ำป่า', 'น้ำล้นตลิ่ง', 'ฝนตกหนัก', 'ดินถล่ม', 'ระบายน้ำ', 'มวลน้ำ', 'flood']

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
  label_th: 'ข่าวน้ำท่วม',
  label_en: 'Flood news',
  intervalMs: CONFIG.intervals.news,
  enabled: true,

  async run({ db, bus }) {
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
        if (!feed.preFiltered && !FLOOD_KEYWORDS.some((k) => item.title.toLowerCase().includes(k))) continue
        seen += 1
        const published = item.pubDate ? new Date(item.pubDate) : null
        const isNew = db.insertNews({
          feed: feed.id,
          guid: item.guid,
          title: item.title,
          link: str(item.link),
          published_at: published && !Number.isNaN(+published) ? published.toISOString() : null,
          fetched_at,
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
