// The Window — one place, three witnesses.
//
// A camera, a credited report, and a headline are each weak alone. Together
// they answer the question a PM2.5 number cannot: what does it look like
// there, who said something, and which story names that place.
//
// Pure. The route gathers the rows; this only groups them. A press pin and
// a LINE note join a camera when they share a province code, or — when the
// camera's station has no code — the same Thai province name.

const norm = (c) => {
  if (c == null || c === '') return null
  const s = String(c).trim()
  if (!/^\d+$/.test(s)) return null
  return s.padStart(2, '0')
}

function samePlace(row, code, th) {
  const rc = norm(row?.province_code)
  if (code && rc && rc === code) return true
  if (!code && th && row?.province_th && row.province_th === th) return true
  return false
}

function httpLink(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}

function slimPress(r) {
  return {
    id: r.id,
    credit_line: r.credit_line,
    title: r.title_raw ?? r.title ?? null,
    source_url: httpLink(r.source_url),
    claims: r.claims ?? null,
    pin_precision: r.pin_precision ?? null,
    place_name: r.place_name ?? null,
    place_kind: r.place_kind ?? null,
    created_at: r.created_at ?? null,
  }
}

function slimStreet(r) {
  return {
    id: r.id,
    kind: r.kind ?? 'other',
    message: r.message ?? null,
    has_image: r.has_image === 1 || r.has_image === true,
    lat: Number.isFinite(r.lat) ? r.lat : null,
    lng: Number.isFinite(r.lng) ? r.lng : null,
    province_th: r.province_th ?? null,
    province_en: r.province_en ?? null,
    created_at: r.created_at ?? null,
  }
}

function mentions(n, code, th) {
  const places = Array.isArray(n.places) ? n.places : []
  if (places.some((p) => samePlace(p, code, th))) return true
  return samePlace(n, code, th)
}

/**
 * @param {object} input
 * @param {Array} input.eyes  haze-eyes rows ({ air, camera, rank })
 * @param {Array} input.press credited citizen/press reports
 * @param {Array} input.street approved LINE reports (no user id, no image path)
 * @param {Array} input.news  headlines, optionally with places[]
 */
export function composeWitness({ eyes = [], press = [], street = [], news = [] } = {}) {
  const places = []
  for (const e of eyes) {
    const code = norm(e.air?.province_code)
    const th = e.air?.province_th ?? null
    const said = []
    for (const n of news) {
      if (!mentions(n, code, th)) continue
      said.push({
        title: n.title ?? '',
        link: httpLink(n.link),
        published_at: n.published_at ?? n.fetched_at ?? null,
        is_fire: n.is_fire === 1 || n.is_fire === true,
      })
      if (said.length >= 4) break
    }
    places.push({
      rank: e.rank ?? places.length + 1,
      air: e.air ?? null,
      camera: e.camera ?? null,
      heard: press.filter((r) => samePlace(r, code, th)).slice(0, 4).map(slimPress),
      street: street.filter((r) => samePlace(r, code, th)).slice(0, 3).map(slimStreet),
      said,
    })
  }
  return {
    count: places.length,
    places,
  }
}
