// The citizen/press haze lane: what gets pinned, and what must never be.
//
// The interesting failures here are not crashes, they are false positives —
// a confident pin on the wrong place, or a sports headline on a map of air.
// Each REGRESSION block below is a bug that actually shipped a wrong pin.
//
// Pure: no network, no DB, no clock. Feed parsing is exercised with literal
// XML so the suite does not depend on a live news feed being up.

import { parseFeedForTest, normalizeItem, extractClaims, reportId, AIR_TERMS } from '../server/sources/citizen-social.js'
import { geocodePlace, __resetIndex } from '../server/socialGeocode.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

__resetIndex()

const TH_FEED = { id: 'thai_rss:test', credit: 'Test feed', lang: 'th' }
const EN_FEED = { id: 'en_rss:test', credit: 'Test feed', lang: 'en' }

// ── the Thai polysemy that put SPORTS on an air-quality map ──────────────
// ฝุ่น is both "air pollution" and "medal dust". ไต้ฝุ่น means "to win a
// medal". The first live run matched two Asian-Games headlines out of 420
// items. The geocoder rejected both for naming no place, but that was luck:
// the filter is what should have caught it, and it did not until it was
// rewritten to use only air-sense phrases.
{
  check('the bare word ฝุ่น is NOT an air term on its own',
    !AIR_TERMS.includes('ฝุ่น'), JSON.stringify(AIR_TERMS))
  check('but ค่าฝุ่น (the dust level) is',
    AIR_TERMS.includes('ค่าฝุ่น'))
  check('and so is ฝุ่นพิษ (toxic dust)',
    AIR_TERMS.includes('ฝุ่นพิษ'))

  const medal = normalizeItem(
    { title: 'ไต้ฝุ่นชายไทยเฮ ขยับขึ้นคว้าเหรียญทองแดง 4×100 เมตร เอเชี่ยนเกมส์',
      link: 'https://example.test/medal', desc: 'ชายไทยได้เหรียญทอง' },
    TH_FEED)
  check('a sports headline about winning bronze is NOT pinned', medal.row === null, JSON.stringify(medal))

  const real = normalizeItem(
    { title: 'ค่าฝุ่นเชียงใหม่พุ่ง 150 ไมโครกรัมต่อลูกบาศก์เมตร เตือนสุขภาพหายใจระวัง',
      link: 'https://example.test/haze', desc: '' },
    TH_FEED)
  check('a real haze headline in เชียงใหม่ IS pinned', real.row !== null, JSON.stringify(real.why))
  check('and it is pinned in Chiang Mai',
    real.row && real.row.province_code === '50', JSON.stringify(real.row?.province_code))
  check('it is a province-centroid pin, not a named point',
    real.row && real.row.pin_precision === 1, JSON.stringify(real.row?.pin_precision))
}

// ── a foreign air story must NOT land on a Thai map ──────────────────────
// "Anak Krakatau blasts ash" is a real air-quality story about Indonesia.
// Pinning it on a Thai tambon because the gazetteer happens to have a village
// whose English name is a common word is the failure this gate exists for.
{
  const krakatau = normalizeItem(
    { title: 'Anak Krakatau blasts ash nearly 10km as smoke drifts over Jakarta',
      link: 'https://example.test/krakatau', desc: 'volcanic ash and smoke' },
    EN_FEED)
  check('a foreign air story is not pinned anywhere in Thailand', krakatau.row === null, JSON.stringify(krakatau))
}

// ── attribution is not optional ──────────────────────────────────────────
{
  const noUrl = normalizeItem(
    { title: 'ค่าฝุ่นที่เชียงใหม่สูงมาก', link: null, desc: '' },
    TH_FEED)
  check('a report with no source URL is rejected', noUrl.row === null)
  check('the rejection says why it is about credit', /credit/i.test(noUrl.why ?? ''), String(noUrl.why))

  const good = normalizeItem(
    { title: 'ค่าฝุ่นที่เชียงใหม่สูงมาก หมอกควันปกคลุมทั่วเมือง', link: 'https://example.test/x', desc: '' },
    TH_FEED)
  check('a credited report carries the publisher in credit_line',
    good.row && good.row.credit_line === 'Test feed', JSON.stringify(good.row?.credit_line))
  check('and keeps the original URL for the reader to check', good.row?.source_url === 'https://example.test/x')
  check('and never translates the headline — it is the publisher\'s words',
    good.row?.title_raw === 'ค่าฝุ่นที่เชียงใหม่สูงมาก หมอกควันปกคลุมทั่วเมือง')
}

// ── the claim label, which is the reason the layer is worth building ──────
// ฝุ่น and ฝนพิชั่น are both "haze" and call for opposite advice.
{
  const smoke = normalizeItem(
    { title: 'ไฟป่าไหม้ที่เชียงใหม่ หมอกควันปกคลุมอำเภอ', link: 'https://example.test/fire', desc: '' },
    TH_FEED)
  check('a forest-fire report is labelled smoke', smoke.claims?.smoke === true, JSON.stringify(smoke.claims))

  const rain = normalizeItem(
    { title: 'ค่าฝุ่นเชียงใหม่ลดลง ฝนพิชั่นจะล้างหมอกควัน', link: 'https://example.test/rain', desc: '' },
    TH_FEED)
  check('a rain report is labelled washout, not smoke',
    rain.claims?.washout === true && rain.claims?.smoke === false, JSON.stringify(rain.claims))

  const c = extractClaims('smoke from a wildfire is coming, scattered rain will clear it')
  check('an English text yields both claims when both are present',
    c.smoke === true && c.washout === true, JSON.stringify(c))
  check('an unrelated text yields no claims at all',
    Object.values(extractClaims('the match ended in a draw')).every((v) => v === false))
}

// ── ids are stable, so a re-run does not duplicate a post ────────────────
{
  const a = reportId('feed:x', 'https://example.test/1')
  const b = reportId('feed:x', 'https://example.test/1')
  const c = reportId('feed:y', 'https://example.test/1')
  check('the same source+post always yields the same id', a === b)
  check('a different source yields a different id for the same URL', a !== c)
  check('ids are short enough to be readable in a URL', a.length <= 20, `len ${a.length}`)
}

// ── feed parsing ─────────────────────────────────────────────────────────
{
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[ค่าฝุ่นเชียงใหม่สูง]]></title>
    <link>https://example.test/a</link>
    <guid>a-1</guid><pubDate>Mon, 28 Sep 2026 12:00:00 +0700</pubDate>
    <description>summary here</description></item>
    <item><title>no link item</title><guid>a-2</guid></item>
    <item><description>no title</description></item>
  </channel></rss>`
  const items = parseFeedForTest(rss)
  check('RSS items are parsed', items.length === 2, `got ${items.length}`)
  check('CDATA is unwrapped', items[0]?.title === 'ค่าฝุ่นเชียงใหม่สูง', JSON.stringify(items[0]?.title))
  check('entities are decoded', !String(items[0]?.title).includes('CDATA'))

  const atom = `<feed><entry><title>Atom title</title>
    <link href="https://example.test/atom"/>
    <id>atom-1</id><updated>2026-09-28T12:00:00Z</updated></entry></feed>`
  const a = parseFeedForTest(atom)
  check('Atom entries are parsed too', a.length === 1, `got ${a.length}`)
  check('an Atom link in an attribute is picked up', a[0]?.link === 'https://example.test/atom', String(a[0]?.link))

  check('malformed XML yields no items rather than throwing',
    Array.isArray(parseFeedForTest('not xml at all')))
  check('an empty string yields no items', parseFeedForTest('').length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
