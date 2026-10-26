// The zone's horizon: where will the air get WORSE, and when.
//
// WHY THIS MODULE EXISTS
// The map answers "where is the air bad" (the province zone) and "which way
// is it moving" (the wind arrows). It answered nothing about TOMORROW, even
// though the server already cooks an hourly, station-adjusted model outlook
// for every province — the same engine the regional page drives with a time
// slider.
//
// WHAT IT MAY CLAIM, AND WHAT IT MAY NOT
// The outlook is a MODEL. It reads a whole model cell where a province is
// much larger, so a province can look better in the model and be worse at
// your street. The only comparison this module makes is MODEL TO MODEL: the
// model's own value now against the model's own value later. That is why the
// horizon never paints an absolute concentration:
//
//   - Painting the model's absolute value beside the ground band would put
//     a cell average next to a station peak, and the map would say
//     "everything improves tomorrow" — the wrong message to carry into a
//     haze season, and an artefact of the model's smoothing, not a forecast.
//   - Painting the model's CHANGE says what it can honestly say: this
//     province is expected to get worse (or better) than it is now.
//
// Three states, one per province: worse, steady, better. A province with no
// model value is UNKNOWN and paints nothing — an absent reading must never
// look like a measurement, and "no change" is a reading.
import { tr } from './i18n.js?v=2.4.126'

/** The horizons on offer, in hours from now. 0 is the present. */
export const HORIZONS = [0, 12, 24, 48]

/**
 * How much the model has to move before the change is a change.
 * 2 µg/m³ over a dozen hours is inside the model's own noise.
 */
export const STEADY_BAND = 2

/**
 * The diverging palette. It is deliberately NOT the band's palette: the band
 * says "how bad is it now", this says "which way is it going", and the two
 * are never on screen at the same time. Red/grey/blue is the standard
 * diverging pair and it stays legible for a red–green colour-blind reader.
 */
export const CHANGE_COLOR = {
  worse: '#A51931',
  // "Steady" is the most common state, so it is quiet — but it must still
  // read as a FILLED province. At the first attempt it was so pale that a
  // steady province looked identical to an unpainted one, which reads as
  // "no data" — the opposite of the truth.
  steady: '#C9D2DA',
  better: '#1565C0',
  // The house's no-data colour: a province the model says nothing about
  // must not look like a province the model says is steady — and it is
  // drawn STRONGER than steady, because "I do not know" is the more
  // important thing to notice.
  unknown: '#8A7F72',
}
export const CHANGE_OPACITY = {
  worse: 0.50,
  steady: 0.34,
  better: 0.38,
  unknown: 0.55,
}

/** The state of one province at one horizon. */
export function deltaState(delta) {
  if (!Number.isFinite(delta)) return 'unknown'
  if (delta > STEADY_BAND) return 'worse'
  if (delta < -STEADY_BAND) return 'better'
  return 'steady'
}

/**
 * The style for a change state. An unknown state still gets a style — the
 * house's no-data grey — because a province with no model value must be
 * visibly different from a province the model says is steady. It is never
 * left unpainted: an unpainted province would read as "no change".
 */
export function changeStyle(state) {
  const key = state === 'unknown' ? 'unknown' : state
  const fillColor = CHANGE_COLOR[key]
  if (!fillColor) return null
  return {
    color: fillColor,
    weight: 1.4,
    opacity: 0.9,
    fillColor,
    fillOpacity: CHANGE_OPACITY[key] ?? 0.3,
    dashArray: null,
  }
}

/**
 * The frame to compare against, and the frame to compare to.
 *
 * The base is the latest frame at or before now (the model's own "now" —
 * comparing the model to the ground would be the apples-to-oranges mistake
 * this module exists to avoid). The target is the frame nearest to
 * `hours` after the base. Returns null when the outlook has no such frame:
 * a horizon beyond the model's reach is NOT the last frame, it is nothing.
 */
export function horizonFrames(frames, hours, nowMs = Date.now()) {
  if (!Array.isArray(frames) || frames.length === 0) return null
  const timed = frames
    .map(f => ({ ...f, t: Date.parse(f.time) }))
    .filter(f => Number.isFinite(f.t))
    .sort((a, b) => a.t - b.t)
  if (timed.length === 0) return null
  // The base is the model's own "now": the latest frame at or before this
  // moment, or the earliest frame if the model has none yet. An earlier
  // attempt reached a frame an hour FORWARD of now, which quietly compared
  // the model with itself one hour apart from where the reader is.
  let base = null
  for (const f of timed) {
    if (f.t <= nowMs) base = f
    else break
  }
  if (!base) base = timed[0]
  if (!hours) return { base, target: base }
  const want = base.t + hours * 3600_000
  let target = null
  let best = Infinity
  for (const f of timed) {
    const d = Math.abs(f.t - want)
    if (d < best) { best = d; target = f }
  }
  // Only accept a target within three hours of the asked-for horizon: a
  // frame that is 20 hours away is not "+12 h".
  if (!target || best > 3 * 3600_000) return null
  return { base, target }
}

/**
 * Per-province change at one horizon.
 * Returns a Map keyed by province code: { now, then, delta, state }.
 * Provinces with no value in either frame are absent from the Map — they
 * are unknown, not steady.
 */
export function outlookByProvince(outlook, hours, nowMs = Date.now()) {
  const out = new Map()
  if (!outlook?.available || !Array.isArray(outlook.points)) return out
  const pair = horizonFrames(outlook.frames, hours, nowMs)
  if (!pair) return out
  const { base, target } = pair
  for (const p of outlook.points) {
    const values = Array.isArray(p.values) ? p.values : []
    const now = values[base.index]
    const then = values[target.index]
    if (!Number.isFinite(now) || !Number.isFinite(then)) continue
    const delta = Math.round((then - now) * 10) / 10
    out.set(String(p.code), { now, then, delta, state: deltaState(delta) })
  }
  return out
}

/** The label on a horizon button, in the reader's language. */
export function horizonLabel(hours) {
  if (!hours) return tr('ตอนนี้', 'now')
  return `+${hours} ${tr('ชม.', 'h')}`
}

/** The short name of a state, in the reader's language. */
export function stateLabel(state) {
  if (state === 'worse') return tr('แย่ลง', 'worsening')
  if (state === 'better') return tr('ดีขึ้น', 'improving')
  if (state === 'steady') return tr('คงที่', 'steady')
  return tr('ไม่มีค่า', 'no value')
}

/**
 * The sentence the legend states when the map is in a forecast mode. It
 * names the model, the comparison, and the limit — a legend that omits the
 * limit turns a model into an authority.
 */
export function changeCaption() {
  return tr(
    'สี = การเปลี่ยนแปลงที่แบบจำลองคาด (เทียบกับตัวแบบเอง ไม่ใช่ค่าจริง) · CAMS ปรับอคติตามสถานี',
    'Colour = the change the MODEL expects (model vs model, not a measurement) · CAMS, station-adjusted',
  )
}
