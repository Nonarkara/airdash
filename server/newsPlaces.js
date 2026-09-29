// News geotagger — every Thai place named in a headline.
//
// Taken from FloodDash's newsGeo.js (the bugs below were measured on that
// project's own news corpus) and pointed at AirDash's gazetteer. Air quality
// headlines fail the same three ways a flood headline does:
//
//   1. One match is not enough. "ฝุ่นพุ่ง เชียงใหม่ ลำพูน ลำปาง" names three
//      provinces; pinning only the first leaves the other two unexplained.
//   2. Thai has no word spaces, so a bare indexOf matches inside a longer
//      word. "ฉับพลัน" contains "พล" and would pin Phon district, Khon Kaen.
//   3. Some province names are ordinary words. "เลย" is "at all / right
//      away" ("เช็กเลย"), "ตาก" is "to dry in the sun". Those count only
//      with an explicit จังหวัด / จ. cue.
//
// District centroids come from public/geo/admin-centroids.json (the same
// file FloodDash uses). A district with no centroid falls back to the
// province middle and is marked coord:'province' so the map can say so.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GEO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo')

const COMBINING_RE = /[ัำ-ฺ็-๎]/
const AMBIGUOUS_NAMES = new Set(['เลย', 'ตาก', 'แพร่', 'พล', 'ท่าใหม่', 'เมือง'])
const PROVINCE_CUE = /(?:จังหวัด|จ\.)\s*$/
const DISTRICT_CUE = /(?:อำเภอ|อ\.|เขต)\s*$/
const BANGKOK_CODE = '10'
const BARE_DISTRICT_MIN_CHARS = 4
const LANDMARK_MIN_CHARS = 5
const BANGKOK_ALIASES = ['กทม', 'กรุงเทพฯ', 'กรุงเทพ']
const THAI_CONTINUE_RE = /[ก-ฮเแโใไ]/

const pad = (code) => String(code ?? '').padStart(2, '0')

let cache = null

function load() {
  if (cache) return cache
  const provinces = JSON.parse(readFileSync(join(GEO, 'provinces.json'), 'utf8'))
  const districts = JSON.parse(readFileSync(join(GEO, 'districts.json'), 'utf8'))
  const plist = provinces.list ?? provinces
  const dlist = districts.list ?? districts

  const provByCode = new Map()
  const provEntries = []
  for (const p of plist) {
    const code = pad(p.provinceCode ?? p.province_code)
    const rec = {
      kind: 'province',
      province_code: code,
      name_th: p.provinceNameTh ?? p.name_th,
      name_en: p.provinceNameEn ?? p.name_en,
      province_th: p.provinceNameTh ?? p.name_th,
      province_en: p.provinceNameEn ?? p.name_en,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      coord: 'province',
    }
    if (!rec.name_th) continue
    provByCode.set(code, rec)
    provEntries.push(rec)
  }

  const normAdmin = (s) => String(s ?? '').replace(/^(อำเภอ|เขต|ตำบล|แขวง)\s*/, '').trim()
  const centroids = new Map()
  try {
    const raw = JSON.parse(readFileSync(join(GEO, 'admin-centroids.json'), 'utf8'))
    for (const c of raw.districts ?? []) {
      if (c.province_code == null) continue
      centroids.set(`${normAdmin(c.name_th)}|${pad(c.province_code)}`, { lat: c.lat, lng: c.lng })
    }
  } catch { /* province centroid is the honest fallback */ }

  const distEntries = []
  for (const d of dlist) {
    const name_th = d.districtNameTh ?? d.name_th
    if (!name_th) continue
    const code = pad(d.provinceCode ?? d.province_code)
    const prov = provByCode.get(code)
    const c = centroids.get(`${name_th}|${code}`)
    distEntries.push({
      kind: 'district',
      province_code: code,
      name_th,
      name_en: d.districtNameEn ?? d.name_en ?? name_th,
      province_th: prov?.name_th ?? null,
      province_en: prov?.name_en ?? null,
      lat: c?.lat ?? prov?.lat ?? null,
      lng: c?.lng ?? prov?.lng ?? null,
      coord: c ? 'place' : 'province',
    })
  }

  const nameCount = new Map()
  for (const d of distEntries) nameCount.set(d.name_th, (nameCount.get(d.name_th) ?? 0) + 1)
  const bkkBare = distEntries.filter((d) => d.province_code === BANGKOK_CODE && nameCount.get(d.name_th) === 1)

  const landmarksByProv = new Map()
  try {
    const seen = new Map()
    for (const l of JSON.parse(readFileSync(join(GEO, 'landmarks.json'), 'utf8'))) {
      const code = pad(l.province_code ?? '')
      if (!code || code === '00' || typeof l.name_th !== 'string' || l.name_th.length < LANDMARK_MIN_CHARS) continue
      if (!/^[ก-๙]/.test(l.name_th) || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue
      const k = `${code}|${l.name_th}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
      if (seen.get(k) > 1) continue
      const prov = provByCode.get(code)
      if (!landmarksByProv.has(code)) landmarksByProv.set(code, [])
      landmarksByProv.get(code).push({
        kind: 'landmark', province_code: code, name_th: l.name_th, name_en: l.name_en ?? l.name_th,
        province_th: prov?.name_th ?? l.province_th ?? null, province_en: prov?.name_en ?? l.province_en ?? null,
        lat: l.lat, lng: l.lng, coord: 'place',
      })
    }
    for (const [code, list] of landmarksByProv) {
      landmarksByProv.set(code, list.filter((l) => seen.get(`${code}|${l.name_th}`) === 1).sort((a, b) => b.name_th.length - a.name_th.length))
    }
  } catch { /* province pin is enough */ }

  cache = { provEntries, distEntries, provByCode, bkkBare, landmarksByProv }
  return cache
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findOccurs(text, name, cueRe, requireCue, { rejectThaiContinue = false } = {}) {
  const hits = []
  let from = 0
  for (;;) {
    const i = text.indexOf(name, from)
    if (i === -1) return hits
    from = i + 1
    const after = text[i + name.length]
    if (after && COMBINING_RE.test(after)) continue
    if (rejectThaiContinue && after && THAI_CONTINUE_RE.test(after)) continue
    if (!requireCue || cueRe.test(text.slice(0, i))) hits.push(i)
  }
}

function occurs(text, name, cueRe, requireCue, opts) {
  return findOccurs(text, name, cueRe, requireCue, opts).length > 0
}

function findDistrictWithProvince(text, districtName, provinceName) {
  if (!provinceName || districtName.length < 3) return []
  const tailRe = new RegExp(`^\\s*(?:จ\\.|จังหวัด)\\s*${escapeRe(provinceName)}`)
  const hits = []
  let from = 0
  for (;;) {
    const i = text.indexOf(districtName, from)
    if (i === -1) return hits
    from = i + 1
    const after = text[i + districtName.length]
    if (after && COMBINING_RE.test(after)) continue
    if (after && THAI_CONTINUE_RE.test(after)) continue
    if (tailRe.test(text.slice(i + districtName.length))) hits.push(i)
  }
}

function refineInProvince(t, prov, distEntries, landmarksByProv, claim) {
  const opts = { rejectThaiContinue: true }
  for (const i of findOccurs(t, prov.name_th, null, false)) claim(i, i + prov.name_th.length)
  const candidates = [
    ...distEntries.filter((d) => d.province_code === prov.province_code && d.name_th.length >= BARE_DISTRICT_MIN_CHARS && d.lat != null && d.name_th !== prov.name_th)
      .sort((a, b) => b.name_th.length - a.name_th.length),
    ...(landmarksByProv.get(prov.province_code) ?? []).filter((l) => !l.name_th.includes(prov.name_th)),
  ]
  for (const c of candidates) {
    for (const i of findOccurs(t, c.name_th, null, false, opts)) {
      if (claim(i, i + c.name_th.length)) return c
    }
  }
  return null
}

/** Every distinct place named in a headline. */
export function matchNewsPlaces(text) {
  const t = String(text ?? '')
  if (t.length < 2) return []
  const { provEntries, distEntries, provByCode, bkkBare, landmarksByProv } = load()
  const out = []
  const seenProvince = new Set()
  const claimed = []
  const claim = (start, end) => {
    for (const [a, b] of claimed) {
      if (start < b && end > a) return false
    }
    claimed.push([start, end])
    return true
  }
  const byLen = [...distEntries].sort((a, b) => b.name_th.length - a.name_th.length)
  for (const d of byLen) {
    const prov = provByCode.get(d.province_code)
    const idxs = [
      ...findOccurs(t, d.name_th, DISTRICT_CUE, true, { rejectThaiContinue: true }),
      ...findDistrictWithProvince(t, d.name_th, prov?.name_th),
    ]
    let accepted = false
    for (const i of idxs) {
      if (!claim(i, i + d.name_th.length)) continue
      accepted = true
    }
    if (!accepted) continue
    out.push(d)
    seenProvince.add(d.province_code)
  }
  for (const p of provEntries) {
    if (seenProvince.has(p.province_code)) continue
    const requireCue = AMBIGUOUS_NAMES.has(p.name_th)
    if (!occurs(t, p.name_th, PROVINCE_CUE, requireCue)) continue
    out.push(refineInProvince(t, p, distEntries, landmarksByProv, claim) ?? p)
    seenProvince.add(p.province_code)
  }
  const otherProvince = [...seenProvince].some((c) => c !== BANGKOK_CODE)
  if (!otherProvince) {
    for (const d of [...bkkBare].sort((a, b) => b.name_th.length - a.name_th.length)) {
      if (out.includes(d)) continue
      let accepted = false
      for (const i of findOccurs(t, d.name_th, DISTRICT_CUE, false, { rejectThaiContinue: true })) {
        if (claim(i, i + d.name_th.length)) accepted = true
      }
      if (accepted) { out.push(d); seenProvince.add(BANGKOK_CODE) }
    }
    const bkk = provByCode.get(BANGKOK_CODE)
    if (bkk && !seenProvince.has(BANGKOK_CODE) && BANGKOK_ALIASES.some((a) => t.includes(a))) {
      out.push(bkk)
      seenProvince.add(BANGKOK_CODE)
    }
  }
  return out
}

/** The row we store: the first place's province, plus every place named. */
export function geotagHeadline(text) {
  const places = matchNewsPlaces(text)
  const p = places[0] ?? null
  return {
    places,
    province_code: p?.province_code ?? null,
    province_th: p?.province_th ?? null,
    province_en: p?.province_en ?? null,
    lat: p?.lat ?? null,
    lng: p?.lng ?? null,
  }
}
