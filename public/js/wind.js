// One wind renderer for the whole dashboard.
//
// WHY THIS MODULE EXISTS
// The bearing lived in two payload shapes: /api/risk published wind_dir_deg and
// wind_towards_deg, while /api/smoke published from_deg. Every surface that
// wanted a bearing reached for whichever shape it already had, so the map
// layer, the hazard plan and the regional page each drew the same wind their
// own way — and the citizen panel, the one screen a resident actually reads,
// showed a wind direction ONLY when a fire happened to be burning upwind,
// because it read the smoke payload. The snapshot builds that map from the
// provinces with something upwind, so on a quiet day the panel said nothing at
// all about which way the air was moving. In the dry season that is the first
// question: is this wind bringing dust in, or clearing it out?
//
// WHAT IT MAY CLAIM
// The bearing is Open-Meteo's forecast DOMINANT direction for the day: not an
// observation, not a trajectory. Daily 10 m data cannot resolve valleys,
// plume rise or arrival time. The arrow points the way the air MOVES
// (downwind) and every wording reads "from X, towards Y", so the picture
// cannot be read backwards.
//
// THE COMPASS IS NOT HERE
// The compass lives on the server (server/wind.js) and the payload carries both
// ends labelled, in Thai and English. A second compass table in the browser
// would be a second answer to "what does NE mean". This module also never
// recomputes a bearing — it draws the number the server published, because two
// formulas in two runtimes eventually disagree by half a degree and nobody can
// tell which one the reader was shown.
import { store } from './state.js?v=2.4.130'
import { tr } from './i18n.js?v=2.4.130'
import { escapeHtml } from './fmt.js?v=2.4.130'

/** Which day's wind this is — published so a reader can tell today from tomorrow. */
export const WIND_BASIS_LABEL = {
  'tomorrow-forecast': ['ทิศลมหลักพรุ่งนี้', "tomorrow's dominant direction"],
  'today-forecast': ['ทิศลมหลักวันนี้', "today's dominant direction"],
}

export function windBasisLabel(basis) {
  const pair = WIND_BASIS_LABEL[basis]
  return pair ? tr(pair[0], pair[1]) : '—'
}

/**
 * The one limit this number carries, in the reader's language. A dominant
 * daily direction is a steering hint, not a flight path: it says which way the
 * air is pointed on average, not what a particular puff of dust will do.
 */
export function windCaveatText() {
  return tr(
    'ทิศลมหลักรายวันจากการพยากรณ์ ไม่ใช่เส้นทางควัน — ลม 10 ม. ไม่จำลองหุบเขา การยกตัว หรือเวลาที่ควันมาถึง',
    'Daily dominant forecast, not a smoke trajectory — 10 m wind does not resolve valleys, plume rise or arrival time')
}

/**
 * Normalize one province row (risk or smoke) into a wind view model.
 * Returns null when the payload carries no usable direction: an absent wind
 * must read as absent, never as north.
 *
 * @param p  a province row carrying the shared wind contract
 */
export function windView(p) {
  if (!p) return null
  const deg = Number.isFinite(p.wind_dir_deg) ? p.wind_dir_deg : null
  if (deg === null) return null
  // Prefer the PUBLISHED towards bearing. The fallback exists only for a
  // payload that predates the field and is computed exactly as the server
  // computes it (server/wind.js towardsDeg) so the two can never disagree.
  const towards = Number.isFinite(p.wind_towards_deg)
    ? p.wind_towards_deg
    : Math.round(((deg + 180) % 360) * 10) / 10
  return {
    deg,
    towards,
    fromTh: p.wind_from_th ?? null,
    fromEn: p.wind_from_en ?? null,
    toTh: p.wind_towards_th ?? null,
    toEn: p.wind_towards_en ?? null,
    speedKmh: Number.isFinite(p.wind_fc_kmh) ? p.wind_fc_kmh : null,
    basis: p.wind_basis ?? null,
    updatedAt: p.wind_updated_at ?? null,
  }
}

/**
 * The arrow. It points the way the air moves; zero rotation points north.
 * SVG rather than a glyph: the rotation is exact, the shape is identical on
 * every platform, and a reader is never asked to interpret a character.
 */
export function windArrowSvg(towards, { size = 24, cls = '' } = {}) {
  if (!Number.isFinite(towards)) return ''
  return `<svg class="wind-arrow${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="transform:rotate(${towards}deg)"><path d="M12 2.6 L18.4 21.4 L12 16.6 L5.6 21.4 Z" fill="currentColor"/></svg>`
}

/**
 * The drawn scale of the wind arrow, in one place.
 *
 * These are the numbers the map, the legend and the guard all have to agree
 * on. They are exported rather than written into the drawing code so that the
 * legend's two example arrows can be the scale's own ends (WIND_ARROW.MIN
 * and WIND_ARROW.MAX) instead of two hand-typed pixel values that can drift
 * away from the function that draws them.
 *
 * MIN  — a still hour: the smallest arrow that still reads as an arrow.
 * MAX  — the ceiling of the scale: the biggest arrow worth drawing.
 * CEIL — the speed at which MAX is reached (km/h). Past it, more ink says
 *        nothing more, so the size clamps instead of growing.
 * UNKNOWN — the size drawn when there is NO speed reading. It is not the
 *        calm size: an absent reading must not look like a measurement.
 */
export const WIND_ARROW = { MIN: 12, MAX: 30, CEIL: 32, UNKNOWN: 18 }

/**
 * The arrow's SIZE says how strong the wind is.
 *
 * A direction with no strength is half an answer: the reader can see where
 * the air is going and not how fast it is moving — and "how strong" is the
 * question that decides whether the air will carry anything. The size grows
 * with the forecast speed on a square-root scale, so the difference between
 * a still hour and a moving one is visible, and stops at a ceiling: past
 * that, more ink says nothing more.
 *
 * A MISSING speed is not a calm wind. It draws at the base size and is
 * marked (`known: false`), so an absent reading never looks like a
 * measurement — the map fades it and the tooltip says so.
 */
export function windArrowSize(speedKmh) {
  const { MIN, MAX, CEIL, UNKNOWN } = WIND_ARROW
  if (!Number.isFinite(speedKmh)) return { size: UNKNOWN, known: false }
  const s = Math.max(0, Math.min(CEIL, speedKmh))
  return { size: Math.round(MIN + (MAX - MIN) * Math.sqrt(s / CEIL)), known: true }
}

/**
 * THE sentence that explains how to read the arrow — stated once.
 *
 * The map legend, the layer panel and the province popup all draw the same
 * arrow. If each of them words the rule for itself, they drift: one says
 * "longer = stronger", another says "bigger = windier", and the reader has to
 * decide which sentence is the true one. So the rule lives here, in one
 * place, and every surface that needs it asks for it.
 *
 * It is exported as a bilingual pair because the guard has to be able to read
 * BOTH sentences without flipping the interface language.
 */
export const WIND_ENCODING = {
  th: 'ลูกศรชี้ทางที่อากาศเคลื่อนไป — ยาวขึ้น = ลมแรงขึ้น',
  en: 'arrow points where the air moves — the longer the arrow, the stronger the wind',
}

/** The encoding sentence in the reader's language. */
export function windEncodingText() {
  return tr(WIND_ENCODING.th, WIND_ENCODING.en)
}

/**
 * The direction as this reader's language names it. When the payload carries
 * no label the raw bearing is printed instead — a number is still true, and a
 * wrong-language label is not.
 */
function directionText(named, deg, withDegrees = false) {
  if (!named) return `${deg}°`
  return withDegrees ? `${named} (${deg}°)` : named
}

/**
 * The compact line for a table row or a map popup:
 * "เหนือ → ใต้ · 14 กม./ชม." / "N → S · 14 km/h".
 * Returns '' when there is no direction at all — the caller then omits the row
 * rather than printing a placeholder that looks like a measurement.
 *
 * @param opts.degrees  also print the raw bearing, for a tooltip where there
 *                      is room and a reader may want to check the model
 */
export function windRowText(p, { degrees = false } = {}) {
  const w = windView(p)
  if (!w) return ''
  const th = store.lang === 'th'
  const from = directionText(th ? w.fromTh : w.fromEn, w.deg, degrees)
  const to = directionText(th ? w.toTh : w.toEn, w.towards, degrees)
  const speed = w.speedKmh != null ? (th ? ` · ${w.speedKmh} กม./ชม.` : ` · ${w.speedKmh} km/h`) : ''
  return `${from} → ${to}${speed}`
}

/**
 * The badge: the arrow plus the words. Used where there is room to say it
 * properly — the citizen panel, and the map's province popup.
 *
 * The direction is named in words AND drawn as an arrow, and the arrow always
 * points downwind, so a reader who misreads the arrow still has the sentence.
 */
export function windBadgeHtml(p) {
  const w = windView(p)
  if (!w) return ''
  const th = store.lang === 'th'
  const from = escapeHtml(directionText(th ? w.fromTh : w.fromEn, w.deg))
  const to = escapeHtml(directionText(th ? w.toTh : w.toEn, w.towards))
  const dir = th
    ? `ลมมาจากทิศ${from} พัดไปทิศ${to}`
    : `From ${from}, blowing towards ${to}`
  const speed = w.speedKmh != null
    ? (th ? `${w.speedKmh} กม./ชม.` : `${w.speedKmh} km/h`)
    : ''
  const meta = [speed, windBasisLabel(w.basis)].filter(Boolean).join(' · ')
  const title = escapeHtml([
    windCaveatText(),
    w.updatedAt ? `${tr('ข้อมูลลม', 'Wind input')} ${w.updatedAt}` : '',
  ].filter(Boolean).join(' · '))
  return `<span class="wind-badge" title="${title}">${windArrowSvg(w.towards, { size: 26 })}<span class="wind-badge-body"><b class="wind-badge-dir">${dir}</b>${meta ? `<span class="wind-badge-meta">${escapeHtml(meta)}</span>` : ''}</span></span>`
}
