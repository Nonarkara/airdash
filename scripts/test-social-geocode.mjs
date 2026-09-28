// Resolving a place out of a sentence about haze.
//
// Each test here corresponds to a bug that actually happened while building
// server/socialGeocode.js, because every one of them produced a confident,
// plausible, WRONG pin on the map — which is the failure mode that matters for
// a citizen-report layer. The bug comment in the source is the history; this
// file is the fence around it.
//
// Pure: no DB, no network, no clock.

import { geocodePlace, geocodeMany, CONFIDENCE, PIN_PRECISION, __resetIndex } from '../server/socialGeocode.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}
const near = (a, b, km = 30) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= km / 110.574 // km → degrees latitude
}

__resetIndex()

// ── the basics ──────────────────────────────────────────────────────────
{
  const g = geocodePlace('หมอกควันหนักที่ดอยอินทนนท์ เชียงใหม่')
  check('a Thai haze sentence resolves', g.ok === true, JSON.stringify(g))
  check('Chiang Mai resolves to the PROVINCE, not a venue called Chiang Mai',
    g.kind === 'province', `${g.kind} / ${g.name_th}`)
  check('Chiang Mai lands in the right place (lat 18.79, 98.73)', near(g.lat, 18.79, 20), `got ${g.lat}`)
  check('a province match is drawn at a province centroid',
    g.pin_precision === PIN_PRECISION.province_centroid, String(g.pin_precision))
}

{
  const g = geocodePlace('Lanna haze chokes Mae Hong Son as PM2.5 hits 180')
  check('an English sentence resolves', g.ok === true)
  check('Mae Hong Son lands in the north-west (lat 18.81)', near(g.lat, 18.81, 20), `got ${g.lat}`)
}

{
  const g = geocodePlace('Haze blankets Nakhon Phanom')
  check('a two-word English place name resolves', g.ok === true && near(g.lat, 17.38, 20), JSON.stringify({ ok: g.ok, lat: g.lat }))
}

// ── REGRESSION: longest match wins over confidence ───────────────────────
// A tambon called "ใหม่" exists in Nakhon Ratchasima. Ranking by confidence
// rather than match length pinned every Chiang Mai haze report there.
{
  const g = geocodePlace('PM2.5 ในเชียงใหม่สูงเกินมาตรฐาน')
  check('a confidence-ranked fragment does not beat the full province name',
    g.name_th === 'เชียงใหม่' && near(g.lat, 18.79, 20),
    `got ${g.name_th} at ${g.lat}`)
  check('a single-place sentence offers no misleading runner-up',
    (g.candidates ?? []).length === 0, JSON.stringify(g.candidates))
}

// ── REGRESSION: Thai vowel marks must survive normalisation ──────────────
// The first version normalised NFD and stripped "diacritics", which collapsed
// เขาใหญ่ (big mountain) into เขา (mountain) and broke matching everywhere.
{
  const g = geocodePlace('ไฟป่าไหม้เขาใหญ่ เชียงใหม่ ค่าฝุ่นพุ่งสูงสุดในรอบ 10 ปี')
  check('a sentence with stacked Thai vowel marks still resolves', g.ok === true, JSON.stringify(g))
  // "เชียงใหม่" (10) must beat "เขาใหญ่" (9) even though the latter is a
  // tambon and scores 3 on specificity against the province's 1.
  check('the longer place name wins even against a more specific tier',
    g.name_th === 'เชียงใหม่' && near(g.lat, 18.79, 20), `got ${g.name_th} @ ${g.lat}`)
}

// ── REGRESSION: ordinary Thai words are not places ───────────────────────
// "อากาศ" means weather/air and appears in nearly every haze post. There is
// a tambon of that name. Before the stopword list, a story about Nakhon
// Phanom was pinned on a tambon 400 km away.
{
  const g = geocodePlace('อากาศวันนี้ดีมาก')
  check('a sentence with no place in it is NOT pinned', g.ok === false, JSON.stringify(g))
  check('the refusal explains itself', typeof g.reason === 'string' && g.reason.length > 0)
  check('a refusal carries no coordinates at all',
    g.lat === undefined || g.lat === null)
  const m = geocodePlace('ระยอง อุตสาหกรรม ฝุ่น PM2.5')
  check('a real place alongside those words is still found', m.ok === true && near(m.lat, 12.85, 20), JSON.stringify({ ok: m.ok, name: m.name_th }))
}

{
  const g = geocodePlace('ที่ตำบลบ้านเป็ด อำเภอแม่สอด จังหวัดตาก หมอกควันท่วม')
  check('a tambon is recognised from a full address sentence', g.ok === true, JSON.stringify(g))
  check('a tambon match is high confidence', g.confidence >= CONFIDENCE.tambon, String(g.confidence))
  check('a tambon pin falls back to a PROVINCE centroid, and says so',
    g.pin_precision === PIN_PRECISION.province_centroid, String(g.pin_precision))
  check('the tambon pin lands in Tak province (lat 16.4)', near(g.lat, 16.4, 60), `got ${g.lat}`)
}

// ── landmarks ───────────────────────────────────────────────────────────
{
  const g = geocodePlace('เขื่อนศรีนครินทร์ ฝุ่นพุ่ง ลุ่มแม่น้ำงาว')
  check('a named dam is recognised', g.ok === true, JSON.stringify(g))
  check('a dam counts as a landmark-level match', g.confidence >= CONFIDENCE.landmark, `${g.confidence} / ${g.kind}`)
  check('a landmark pin is a landmark point', g.pin_precision === PIN_PRECISION.landmark_point)
}

// ── degenerate input ────────────────────────────────────────────────────
{
  check('empty text is refused', geocodePlace('').ok === false)
  check('whitespace is refused', geocodePlace('   ').ok === false)
  check('null is refused', geocodePlace(null).ok === false)
  const long = geocodePlace('หมอกควัน'.repeat(500))
  check('a very long text does not crash the scanner', typeof long.ok === 'boolean')
  const ascii = geocodePlace('x'.repeat(10000))
  check('a long ASCII string does not crash the scanner', typeof ascii.ok === 'boolean')
}

{
  const out = geocodeMany(['หมอกควันที่เชียงใหม่', 'ค่าฝุ่นสูงขึ้นอย่างต่อเนื่อง', 'ฝุ่นที่ระยอง'])
  check('geocodeMany returns only the resolvable ones', out.length === 2, `got ${out.length}`)
  check('geocodeMany preserves the caller index', out.map((o) => o.index).join(',') === '0,2', out.map((o) => o.index).join(','))
}

// ── REGRESSION: cross-language matching ─────────────────────────────────
// The first live run of the RSS lane put Thai pins on English articles:
// ScienceDaily writes "the pollutant that matters most" and the gazetteer has
// a tambon called ธาตุ — the Thai transliteration of "that". Four of the first
// ten live pins were this bug. A feed now declares its language and the
// geocoder only looks at names in that script.
{
  const en = "the pollutant that matters most is fine particulate matter"
  check('an English sentence does NOT match a Thai place name',
    geocodePlace(en, { lang: 'en' }).ok === false, JSON.stringify(geocodePlace(en, { lang: 'en' })))
  check('the same sentence DOES match when no language is required',
    typeof geocodePlace(en).ok === 'boolean')

  const mixed = "A wildfire in Lampang province sent smoke into Mae Hong Son"
  const g = geocodePlace(mixed, { lang: 'en' })
  check('an English sentence about Thailand resolves', g.ok === true, JSON.stringify(g))
  check('and it resolves to a northern province, not a Thai-script collision',
    g.lat >= 17.5 && g.lat <= 20, `got ${g.name_th} @ ${g.lat}`)

  const th = geocodePlace('หมอกควันหนักที่เชียงใหม่', { lang: 'th' })
  check('a Thai sentence still resolves with lang=th', th.ok === true, JSON.stringify(th))
  check('a Thai sentence is NOT resolved against English names',
    geocodePlace('หมอกควันหนักที่เชียงใหม่', { lang: 'en' }).ok === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
