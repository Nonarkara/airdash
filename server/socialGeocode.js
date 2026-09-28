// Turn a Thai (or English) sentence about haze into a map pin.
//
// WHY THIS EXISTS SEPARATELY FROM gazetteer.js
// ---------------------------------------------
// server/gazetteer.js is a TYPE-AHEAD search engine. A person typing "เชียง"
// wants ranked suggestions, and fuzzy prefix matching is exactly right for
// that. This is the opposite problem: we are given a finished sentence — a
// news headline, a social post — and we need to know which single place it is
// about. Fuzzy matching is actively harmful here, because a headline that
// merely mentions เชียงใหม่ would happily match a tourist landmark called
// เชียงใหม่ and pin the report on a rooftop.
//
// So the algorithm is different: scan the text for place names as SUBSTRINGS,
// longest match first, and rank by how specific the match is. A report saying
// "ดอยอินทนนท์มองไม่เห็น" (can't see Doi Inthanon) is a far more useful pin
// than one saying "เชียงใหม่" — and the long match wins because it is longer.
//
// THE DATA REALITY, CHECKED BEFORE WRITING ANY OF THIS (2026-09-28)
// -----------------------------------------------------------------
// The four gazetteer files do NOT all carry coordinates, and the difference
// decides what can honestly be pinned:
//
//   provinces.json      77 rows     77 with lat/lng
//   districts.json     928 rows      0 with lat/lng
//   subdistricts.json 7436 rows      0 with lat/lng
//   landmarks.json   12854 rows  12854 with lat/lng
//
// So a district or tambon can be RECOGNISED in the text but has no point to
// draw a pin at. The honest handling — and the one server/gazetteer.js
// already uses for its own search results — is to fall back to the province
// centroid and say so, rather than inventing a point or dropping the report.
// `confidence` records what was matched; `pin_precision` records what the pin
// actually is. A consumer that draws pins differently by precision would be
// lying to the reader otherwise.
//
// A second data caveat, found while testing: a handful of landmark
// coordinates are plainly wrong. "เขื่อนศรีนครินทร์" (Sirikit Dam, which is in
// Uttaradith at roughly 17.98 N, 99.79 E) carries 14.41 N, 99.13 E — central
// Thailand. We use the coordinates we are given, but `pin_precision` is not a
// claim of accuracy, and the map layer labels a landmark pin as a landmark
// pin, not as a verified observation point.
//
// SHORT-NAME NOISE
// ----------------
// 135 landmark names are 3–5 characters, and some are ordinary Thai words —
// "บ้าน" is literally "house", and there is a place of that name. Scanning
// free text for 3-character names produces confident nonsense. Hence MIN_NAME
// by tier, and a stopword list for the shortest landmarks. Provinces and
// districts are exempt: they are curated administrative names, so "ลำปาง"
// (7 chars) and even a short one are safe to scan for.
//
// Pure: no DB, no network, no clock. Records load once and are cached.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEO = join(__dirname, '..', 'public', 'geo')

/** What we matched. Higher is more specific evidence about WHERE. */
export const CONFIDENCE = {
  none: 0,
  province: 1,
  district: 2,
  tambon: 3,
  landmark: 4,
}

/** What the pin we actually drew IS. Separate from confidence on purpose: a
 *  tambon match is strong evidence about location, and a province-centroid pin
 *  is a weak thing to draw. Conflating them produces a map that looks more
 *  precise than it is. */
export const PIN_PRECISION = {
  none: 0,
  province_centroid: 1,  // drawn at a province's centre — could be 100 km off
  landmark_point: 2,     // drawn at a named place's own coordinate
}

const MIN_NAME = { province: 3, district: 3, tambon: 4, landmark: 8 }

/** Ordinary words that are also place names, and would match by accident. */
const STOPWORDS = new Set([
  'บ้าน', 'เมือง', 'อำเภอ', 'ตำบล', 'แม่น้ำ', 'ป่า', 'เขา', 'วัด', 'โรงพยาบาล',
  'หมู่', 'น้ำ', 'ดอย', 'ประตู', 'สะพาน', 'ถนน', 'สนาม', 'ศาล', 'ตลาด', 'รัฐ',
  // Words that are ABOUT air. A haze headline contains "อากาศดี" (the air is
  // good) in almost every post, and there happens to be a tambon called
  // อากาศ — so without this, every single report matches it. Found by testing,
  // not by guessing: the first run pinned a story about Nakhon Phanom on a
  // tambon 400 km away because of the word "อากาศ".
  'อากาศ', 'ฝุ่น', 'ควัน', 'หมอก', 'อากาศดี', 'ฝน', 'แดด', 'ลม', 'ความร้อน',
  // English. The gazetteer's own name_en for the tambon ธาตุ is "That" — the
  // English word — so scanning an English sentence for place names matches
  // "that" in "...the pollutant that matters most" and pins a ScienceDaily
  // air-quality article on a village in Surin. Function words and bare
  // English nouns are the risk, not Thai ones.
  'that', 'the', 'and', 'for', 'with', 'this', 'from', 'have', 'been',
  'will', 'more', 'than', 'most', 'some', 'part', 'matter', 'air', 'pollutant',
  'smoke', 'haze', 'dust', 'rain', 'wind', 'fire', 'north', 'south', 'east', 'west',
])

/** Landmark categories a haze report is plausibly ABOUT rather than passing
 *  through. A haze report naming a national park or a dam is describing a
 *  visibility observation; one naming a temple is probably just a location. */
const VISIBILITY_LANDMARKS = new Set(['park', 'dam', 'attraction', 'airport', 'university'])

// DO NOT strip Thai combining marks. This is the classic mistake and it was
// made and caught in testing: NFD + strip-"diacritics" looks like a
// reasonable Latin normalisation, but in Thai the vowel and tone marks are
// part of the base word, not decoration. Stripping them collapses distinct
// words together — "เขาใหญ่" (big mountain) became "เขา" (mountain) and
// stopped matching its own gazetteer entry, while "เชียงใหม่" degraded to a
// fragment that then matched the wrong tambon. Three separate wrong pins in
// one test run, all traceable to this function.
//
// So: NFC (compose, do not decompose), lowercase for the Latin case, collapse
// whitespace. That is all this needs. Thai has no case, so lowercasing is a
// no-op on it, and the Latin place names in the same gazetteer are plain
// ASCII.
function norm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let INDEX = null

function loadIndex() {
  if (INDEX) return INDEX
  const read = (f) => JSON.parse(readFileSync(join(GEO, f), 'utf8'))
  const rows = (o) => (Array.isArray(o) ? o : o.data ?? o.rows ?? [])

  // Province centroids — the only fallback point we have.
  const provByCode = new Map()
  for (const p of rows(read('provinces.json'))) {
    provByCode.set(p.provinceCode, {
      lat: p.lat, lng: p.lng,
      name_th: p.provinceNameTh, name_en: p.provinceNameEn,
    })
  }

  /** name → record, one per name; a more specific tier replaces a vaguer one. */
  const byName = new Map()
  // Thai and English names are indexed under SEPARATE keys. Keying them
  // together is what put Thai pins on English articles: ScienceDaily writes
  // "...the pollutant that matters most" and the gazetteer has a tambon called
  // ธาตุ, which is the Thai transliteration of "that". Four of the first ten
  // live pins were English articles matched to Thai place names that merely
  // LOOK like a word in the sentence. A feed declares its language and the
  // geocoder only considers names in that script.
  const scriptOf = (s) => (/[\u0E00-\u0E7F]/.test(s) ? 'th' : 'en')
  const put = (rec, tier, names) => {
    for (const raw of names) {
      const n = norm(raw)
      if (!n || STOPWORDS.has(n) || n.length < MIN_NAME[rec.minKind]) continue
      const key = scriptOf(raw) + '\u0000' + n
      const prev = byName.get(key)
      if (!prev) { byName.set(key, { ...rec, tier, script: scriptOf(raw) }); continue }
      // Administrative beats landmark, always.
      if (prev.kind === 'landmark' && rec.kind !== 'landmark') { byName.set(key, { ...rec, tier, script: scriptOf(raw) }); continue }
      if (prev.kind !== 'landmark' && rec.kind === 'landmark') continue
      // Among administrative records the PROVINCE wins. This is the opposite
      // of the intuitive "more specific wins" rule, and the data forces it:
      // Thailand has 77 provinces but 7,436 tambons drawn from ~1,500 distinct
      // names, so tambon names are heavily reused — there is a tambon called
      // เชียงใหม่ in Nakhon Ratchasima. Province names are unique by
      // construction, so when a name is both, the province is what the text
      // meant.
      if (tier < prev.tier) byName.set(key, { ...rec, tier, script: scriptOf(raw) })
    }
  }

  for (const p of rows(read('provinces.json'))) {
    const rec = {
      kind: 'province', minKind: 'province', confidence: CONFIDENCE.province,
      code: p.provinceCode,
      province_code: String(p.provinceCode).padStart(2, '0'),
      name_th: p.provinceNameTh, name_en: p.provinceNameEn,
      lat: p.lat, lng: p.lng,
    }
    put(rec, CONFIDENCE.province, [p.provinceNameTh, p.provinceNameEn])
  }
  // Districts and tambons: recognisable, but NO coordinates in the file. We
  // keep the match for its province so the pin lands somewhere honest.
  for (const d of rows(read('districts.json'))) {
    const rec = {
      kind: 'district', minKind: 'district', confidence: CONFIDENCE.district,
      code: d.districtCode, province_code: d.provinceCode,
      name_th: d.districtNameTh, name_en: d.districtNameEn,
      lat: null, lng: null,
    }
    put(rec, CONFIDENCE.district, [d.districtNameTh, d.districtNameEn])
  }
  for (const t of rows(read('subdistricts.json'))) {
    const rec = {
      kind: 'tambon', minKind: 'tambon', confidence: CONFIDENCE.tambon,
      code: t.subdistrictCode, district_code: t.districtCode, province_code: t.provinceCode,
      name_th: t.subdistrictNameTh, name_en: t.subdistrictNameEn,
      lat: null, lng: null,
    }
    put(rec, CONFIDENCE.tambon, [t.subdistrictNameTh, t.subdistrictNameEn])
  }
  for (const l of rows(read('landmarks.json'))) {
    const rec = {
      kind: 'landmark', minKind: 'landmark', confidence: CONFIDENCE.landmark,
      category: l.category ?? null,
      name_th: l.name_th, name_en: l.name_en,
      province_code: l.province_code ?? null,
      province_th: l.province_th ?? null, province_en: l.province_en ?? null,
      lat: l.lat, lng: l.lng,
    }
    put(rec, CONFIDENCE.landmark, [l.name_th, l.name_en])
  }

  // `names` holds the SEARCHABLE name, without the script prefix that
  // byName uses as its key. Keeping them separate matters: the prefix would
  // otherwise be part of the string we do `hay.includes(n)` against, and
  // every lookup would silently fail.
  const names = [...byName.entries()]
    .map(([key, rec]) => ({ key, name: key.slice(key.indexOf('\u0000') + 1), script: rec.script }))
    .sort((a, b) => b.name.length - a.name.length)
  INDEX = { byName, names, provByCode }
  return INDEX
}

export function __resetIndex() { INDEX = null }

/**
 * Resolve free text to a place.
 *
 * `confidence` — how specific the evidence is.
 * `pin_precision` — what the drawn pin is.
 * A tambon match therefore returns confidence 3 with precision
 * province_centroid, which is the truthful pair: we know exactly which
 * subdistrict, and we drew a province centre.
 */
export function geocodePlace(text, { prefer = null, lang = null } = {}) {
  const raw = String(text ?? '').trim()
  if (!raw) return { ok: false, confidence: CONFIDENCE.none, pin_precision: PIN_PRECISION.none, reason: 'empty text' }
  const hay = norm(raw)
  const { byName, names, provByCode } = loadIndex()

  const hits = []
  for (const { key, name, script } of names) {
    if (name.length > hay.length) continue
    if (script === 'en') {
      // Latin-script names must land on a WORD BOUNDARY. Thai has no
      // inter-word spacing so substring matching is correct there, but in
      // Latin a substring match is a coin flip: the tambon "โรง" has the
      // English name "Rong" and matched inside the Guardian's "...a little
      // love at Langkawi" — no. It matched inside other words entirely, and
      // the story was pinned on a Thai village 1,500 km from the subject.
      const re = new RegExp(`(?<![a-z0-9])${escapeRe(name)}(?![a-z0-9])`)
      if (!re.test(hay)) continue
    } else if (!hay.includes(name)) continue
    // Only consider names written in the caller's script. See the note on
    // scriptOf in loadIndex — this is the guard that stops an English
    // sentence being pinned to a Thai place whose name happens to look like
    // an English word transliterated into Thai.
    if (lang && script !== lang) continue
    const rec = byName.get(key)
    // A single Latin-script word is only trustworthy at province level.
    // Tambon English names are transliterations ("Chang", "Asa", "Ahi",
    // "Rong") that collide with real English words, so a story matching one
    // of those is far more likely to have matched an ordinary word than the
    // place. Provinces ("Trang", "Rayong") and multi-word names
    // ("Mae Hong Son") are names a story actually cites.
    if (lang === 'en' && script === 'en' && rec && rec.kind !== 'province' && !/\s/.test(name)) continue
    hits.push({ matched: name, rec })
  }
  if (!hits.length) {
    return {
      ok: false, confidence: CONFIDENCE.none, pin_precision: PIN_PRECISION.none,
      reason: 'no known place name in text',
    }
  }

  // LONGEST MATCH WINS, and this must happen before any confidence ranking.
  // Drop any candidate whose matched string is contained inside a longer one.
  // Without this, a text containing "เชียงใหม่" yields BOTH the province
  // "เชียงใหม่" (10 chars) and a tambon literally called "ใหม่" (4 chars, in
  // Nakhon Ratchasima) — and a confidence-weighted score ranks the 4-char
  // tambon higher, pinning every Chiang Mai report 300 km away. A match that
  // is a fragment of a longer match is not a second place; it is the same
  // place, matched badly.
  hits.sort((a, b) => b.matched.length - a.matched.length)
  const pruned = hits.filter((h, i) =>
    !hits.slice(0, i).some((k) => k.matched.includes(h.matched)))

  // Match LENGTH dominates, then specificity. Length is weighted by 100 so it
  // can never be outvoted by the confidence term: a headline naming
  // "เชียงใหม่" (10 chars) and "เขาใหญ่" (9 chars) is about Chiang Mai, and a
  // confidence-weighted score handed it to the tambon because tambon scores 3
  // against the province's 1. When a sentence names two genuinely different
  // places, the more completely-written one is the better guess; when it names
  // the same place twice, pruning above already removed the fragment.
  const score = (h) => {
    const r = h.rec
    let s = h.matched.length * 100 + r.confidence * 10
    if (r.kind === 'landmark') {
      // A visibility landmark earns a nudge; a temple does not.
      if (VISIBILITY_LANDMARKS.has(r.category)) s += 5
      else s -= 6
    }
    return s
  }
  if (prefer) pruned.sort((a, b) => (prefer(b.rec) - prefer(a.rec)) || (score(b) - score(a)))
  else pruned.sort((a, b) => score(b) - score(a))

  const best = pruned[0]
  const r = best.rec

  // Resolve a point. The precision label follows the KIND of the record, not
  // whether the record happened to carry a coordinate — a province centroid
  // is a province centroid even when the province itself supplies the point,
  // and calling it a "landmark point" would tell a reader the pin is sharper
  // than it is.
  let lat = r.lat, lng = r.lng
  let precision = r.kind === 'landmark' ? PIN_PRECISION.landmark_point : PIN_PRECISION.province_centroid
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const prov = provByCode.get(r.province_code ?? (r.kind === 'province' ? r.code : null))
    if (!prov || !Number.isFinite(prov.lat)) {
      return {
        ok: false, confidence: CONFIDENCE.none, pin_precision: PIN_PRECISION.none,
        reason: `matched ${r.kind} "${r.name_th}" but neither it nor its province has a coordinate`,
        kind: r.kind, name_th: r.name_th, name_en: r.name_en, matched: best.matched,
      }
    }
    lat = prov.lat; lng = prov.lng
    precision = PIN_PRECISION.province_centroid
    r.province_th ??= prov.name_th
    r.province_en ??= prov.name_en
  }
  // A landmark that is not a visibility reference is a weak place to be
  // reporting air from, so it does not earn full landmark confidence even
  // though its coordinate is a real point.
  const confidence = (r.kind === 'landmark' && !VISIBILITY_LANDMARKS.has(r.category))
    ? CONFIDENCE.tambon
    : r.confidence

  return {
    ok: true,
    confidence,
    pin_precision: precision,
    kind: r.kind,
    category: r.category ?? null,
    name_th: r.name_th, name_en: r.name_en,
    lat, lng,
    province_code: r.province_code ?? (r.kind === 'province' ? String(r.code).padStart(2, '0') : null),
    province_th: r.province_th ?? null,
    province_en: r.province_en ?? null,
    matched: best.matched,
    candidates: pruned.slice(1, 5).map((h) => ({
      kind: h.rec.kind, name_th: h.rec.name_th, name_en: h.rec.name_en,
      province_code: h.rec.province_code ?? null,
    })),
  }
}

/** Resolve a list of texts; returns only those that produced a pin. */
export function geocodeMany(texts, opts = {}) {
  const out = []
  texts.forEach((t, i) => { const g = geocodePlace(t, opts); if (g.ok) out.push({ index: i, ...g }) })
  return out
}
