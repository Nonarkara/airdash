// CALIBRATE THE WASHOUT CURVE AGAINST MEASURED RAIN AND MEASURED PM.
//
// WHY THIS EXISTS
// server/washout-curve.js publishes a FINE curve (ceiling 40%) and a COARSE
// curve (ceiling 60%). The fine one comes from the literature. The coarse
// one is, in the source's own words, "NOT a locally calibrated coefficient
// — AirDash has no PM10 instrument to fit against", and it carries an
// instruction: "Do not tighten it without a real coarse-fraction
// measurement to fit."
//
// AirDash now HAS the instrument: air4thai publishes pm25 AND pm10 for 66
// stations, so the coarse fraction of PM10 (1 − PM2.5/PM10) is measurable
// per station-hour; and thaiwater_rain publishes hourly rain for ~4,500
// gauges, so rain is measurable in time, not only in total.
//
// THE METHOD — EVENT COMPOSITE, NOT WINDOW MATCHING
// A first attempt compared the PM2.5 level 24h after a "rain_24h" reading
// with the level 24h before it. That is wrong in a way that matters:
// rain_24h is a TRAILING total, so a large value can mean the rain fell
// early in the window (the washout is already in the "after" window) or
// late in it (the washout has not happened yet). The two cases are
// indistinguishable from the total alone, and they pull the answer in
// opposite directions. Measured that way, MORE rain appeared to wash LESS.
//
// So: find the rain EVENTS. A contiguous run of hours with measurable rain
// at the nearby gauges, bounded by dry hours. For each event:
//
//   baseline = mean PM2.5 over the 24h BEFORE the event, which must be dry
//   after    = mean PM2.5 over the 12h AFTER the event, which must be dry
//   relief   = (baseline − after) / baseline
//
// and the dry hours at the same stations give the control. Rain that falls
// elsewhere in the world, or between the windows, cannot be credited.
//
// THE LIMITS, STATED UP FRONT
//   · The rain gauge is not the air station. Gauges within RADIUS_KM are
//     used; the closer the better.
//   · PM2.5 also responds to wind, transport and humidity. The dry control
//     is what removes the common part; the remainder is attributed to the
//     rain, which is an attribution, not a proof.
//   · This measures PM2.5 response. It CANNOT measure a coarse-fraction
//     removal rate for PM10, which is what the coarse curve is about.
//
// Usage: node scripts/ops/calibrate-washout.mjs [days] [radius_km]
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const DB = process.env.AIRDASH_DB_PATH ?? join(ROOT, 'data', 'airdash.db')
const DAYS = Number(process.argv[2] ?? 45)
const RADIUS_KM = Number(process.argv[3] ?? 25)

const DRY_HOURS = 12        // dry hours that must bound a rain event
const BASELINE_H = 24       // hours of PM2.5 BEFORE the event
const AFTER_H = 12          // hours of PM2.5 AFTER the event
const MIN_BASE_PM25 = 15    // only where there is particulate to wash
const RAIN_EVENT_MM = 1     // an event must deliver at least this

const db = new DatabaseSync(DB, { readOnly: true })
const since = new Date(Date.now() - DAYS * 86400e3).toISOString().slice(0, 13) + ':00'

const km = (a1, o1, a2, o2) => {
  const R = 6371, dLat = (a2 - a1) * Math.PI / 180, dLng = (o2 - o1) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
const median = a => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
// The readings store obs_time in LOCAL time with no zone suffix, so the
// arithmetic has to stay in that same clock. Parsing as local and calling
// toISOString() shifts every key by the zone offset and silently matches
// nothing; appending 'Z' pins the arithmetic to the stored clock.
const hourAt = (iso, off) => new Date(Date.parse(`${iso}Z`) + off * 3600e3).toISOString().slice(0, 13) + ':00'
const offsets = (from, to) => { const o = []; for (let k = from; k >= to; k--) o.push(k); return o }

console.log(`loading ${DAYS} days from ${DB} …`)
const airStations = db.prepare(`
  SELECT s.station_key, s.name_en, s.lat, s.lng, s.province_code
    FROM stations s
   WHERE s.source='air4thai' AND s.lat IS NOT NULL`).all()
const rainStations = db.prepare(`
  SELECT station_key, lat, lng FROM stations
   WHERE source='thaiwater_rain' AND lat IS NOT NULL`).all()

const p25 = new Map(), p10 = new Map(), rain1h = new Map()
for (const r of db.prepare(`SELECT station_key, metric, obs_time, value FROM readings
   WHERE source='air4thai' AND metric IN ('pm25','pm10') AND obs_time >= ?`).all(since)) {
  const m = r.metric === 'pm25' ? p25 : p10
  let s = m.get(r.station_key); if (!s) { s = new Map(); m.set(r.station_key, s) }
  if (r.value !== null && r.value >= 0) s.set(r.obs_time, r.value)
}
for (const r of db.prepare(`SELECT station_key, obs_time, value FROM readings
   WHERE source='thaiwater_rain' AND metric='rain_1h' AND obs_time >= ?`).all(since)) {
  let s = rain1h.get(r.station_key); if (!s) { s = new Map(); rain1h.set(r.station_key, s) }
  // Bucket the 10-minute reports into the hour they fall in.
  const h = r.obs_time.slice(0, 13) + ':00'
  s.set(h, (s.get(h) ?? 0) + (r.value ?? 0))
}
console.log(`loaded: ${p25.size} pm25 series, ${p10.size} pm10 series, ${rain1h.size} rain series`)

// ── the events ───────────────────────────────────────────────────────────
const events = []
const dryControl = []
let considered = 0, noGauges = 0, tooShort = 0

for (const st of airStations) {
  const series = p25.get(st.station_key)
  if (!series) continue
  const p10s = p10.get(st.station_key)
  if (!p10s) continue

  const near = rainStations.filter(r => km(st.lat, st.lng, r.lat, r.lng) <= RADIUS_KM)
  if (!near.length) { noGauges++; continue }
  const nearRain = near.map(g => rain1h.get(g.station_key)).filter(Boolean)
  if (!nearRain.length) { noGauges++; continue }

  // The hourly rain at this station: the median across nearby gauges, so a
  // single wet or broken gauge cannot invent an event.
  const hours = [...series.keys()].sort()
  if (hours.length < 24 * 5) { tooShort++; continue }
  const first = hours[0], last = hours[hours.length - 1]

  const rainHour = {}
  for (const t of hours) {
    const vals = []
    for (const g of nearRain) { const v = g.get(t); if (v !== undefined) vals.push(v) }
    rainHour[t] = vals.length ? median(vals) : 0
  }

  // Walk the series and cut out RAIN EVENTS: a run of hours with rain,
  // bounded by DRY_HOURS of dry weather on each side.
  let i = 0
  while (i < hours.length) {
    const t = hours[i]
    if (!(rainHour[t] > 0)) { i++; continue }
    // start of the run
    let s = i
    while (i < hours.length && rainHour[hours[i]] > 0) i++
    const e = i - 1
    const tStart = hours[s], tEnd = hours[e]
    const total = hours.slice(s, e + 1).reduce((a, h) => a + rainHour[h], 0)
    if (total < RAIN_EVENT_MM) continue
    // Require DRY_HOURS of dry weather on both sides.
    const before = hours.slice(Math.max(0, s - DRY_HOURS), s)
    const after = hours.slice(e + 1, e + 1 + DRY_HOURS)
    if (before.length < DRY_HOURS || after.length < DRY_HOURS) continue
    if (before.some(h => rainHour[h] > 0) || after.some(h => rainHour[h] > 0)) continue

    // The PM2.5 windows: dry baseline before the event, dry aftermath.
    const baseKeys = offsets(DRY_HOURS, 1).map(k => hourAt(tStart, -k - BASELINE_H + DRY_HOURS - DRY_HOURS))
    const base = []
    for (const k of offsets(BASELINE_H, 1)) {
      const v = series.get(hourAt(tStart, -k))
      if (v === undefined) { base.length = 0; break }
      base.push(v)
    }
    if (!base.length) continue
    const afterPm = []
    for (const k of offsets(AFTER_H, 1)) {
      const v = series.get(hourAt(tEnd, k))
      if (v === undefined) { afterPm.length = 0; break }
      afterPm.push(v)
    }
    if (!afterPm.length) continue

    const baseMean = mean(base)
    if (baseMean === null || baseMean < MIN_BASE_PM25) continue
    const pm10Mean = mean(offsets(BASELINE_H, 1).map(k => p10s.get(hourAt(tStart, -k))).filter(v => v !== undefined))
    const coarseFraction = pm10Mean && pm10Mean > 0 ? 1 - (baseMean / pm10Mean) : null

    events.push({
      st: st.station_key, province: st.province_code,
      start: tStart, end: tEnd, total,
      base: baseMean,
      relief: ((baseMean - mean(afterPm)) / baseMean) * 100,
      coarseFraction, pm10: pm10Mean,
    })
    considered++
  }

  // DRY CONTROL: the same measurement with NO rain anywhere in the windows.
  // Without this check the "dry" control silently contains rainy hours —
  // and a control that contains rain cannot be the thing the wet groups are
  // compared against.
  let d = 0
  for (const t of hours) {
    if (d++ % 12) continue
    const bk = offsets(BASELINE_H, 1).map(k => hourAt(t, -k))
    const ak = offsets(AFTER_H, 1).map(k => hourAt(t, k))
    // Every hour from the start of the baseline to the end of the aftermath
    // must be dry, including the gap between them.
    const span = []
    for (let k = BASELINE_H; k >= -AFTER_H; k--) span.push(hourAt(t, -k))
    if (span.some(h => (rainHour[h] ?? 0) > 0)) continue
    const b = [], a = []
    let ok = true
    for (const k of bk) { const v = series.get(k); if (v === undefined) { ok = false; break } b.push(v) }
    if (!ok) continue
    for (const k of ak) { const v = series.get(k); if (v === undefined) { ok = false; break } a.push(v) }
    if (!ok) continue
    const bm = mean(b)
    if (bm === null || bm < MIN_BASE_PM25) continue
    const p10m = mean(offsets(BASELINE_H, 1).map(k => p10s.get(hourAt(t, -k))).filter(v => v !== undefined))
    const cf = p10m && p10m > 0 ? 1 - (bm / p10m) : null
    dryControl.push({ st: st.station_key, base: bm, relief: ((bm - mean(a)) / bm) * 100, coarseFraction: cf })
  }
}

console.log(`\nrain events with clean dry windows: ${events.length}`)
console.log(`dry control samples: ${dryControl.length}`)
console.log(`stations skipped (no gauges / too short): ${noGauges} / ${tooShort}\n`)

// ── the report ───────────────────────────────────────────────────────────
const FINE = { '1-<5': 8, '5-<15': 20, '15-<35': 30, '>=35': 40 }
const COARSE = { '1-<5': 12, '5-<15': 30, '15-<35': 45, '>=35': 60 }
const band = mm => mm < 5 ? '1-<5' : mm < 15 ? '5-<15' : mm < 35 ? '15-<35' : '>=35'
const cls = cf => cf === null ? null : cf >= 0.45 ? 'coarse' : cf <= 0.25 ? 'fine' : 'mixed'
const fmt = v => v === null || v === undefined ? '   —  ' : (v >= 0 ? ' ' : '') + v.toFixed(1).padStart(6)

for (const c of ['fine', 'mixed', 'coarse']) {
  const ctrl = dryControl.filter(e => cls(e.coarseFraction) === c)
  const evs = events.filter(e => cls(e.coarseFraction) === c)
  if (!ctrl.length && !evs.length) continue
  const dry = median(ctrl.map(e => e.relief))
  console.log(`── ${c.toUpperCase()} ── dry control: n=${String(ctrl.length).padStart(5)}, relief ${fmt(dry)}%, baseline PM2.5 ${fmt(median(ctrl.map(e => e.base)))}`)
  const pub = c === 'coarse' ? COARSE : FINE
  for (const b of ['1-<5', '5-<15', '15-<35', '>=35']) {
    const g = evs.filter(e => band(e.total) === b)
    if (!g.length) { console.log(`   ${b.padStart(6)} mm   n=${'0'.padStart(5)}   no events`); continue }
    const m = median(g.map(e => e.relief))
    console.log(`   ${b.padStart(6)} mm   n=${String(g.length).padStart(5)}   observed ${fmt(m)}%   dry-adjusted ${fmt(m - dry)}%   published ${String(pub[b]).padStart(3)}%   baseline PM2.5 ${fmt(median(g.map(e => e.base)))}`)
  }
  console.log('')
}

console.log('── coarse minus fine, same rain band (the claim: coarse washes more) ──')
for (const b of ['1-<5', '5-<15', '15-<35', '>=35']) {
  const f = events.filter(e => cls(e.coarseFraction) === 'fine' && band(e.total) === b)
  const c = events.filter(e => cls(e.coarseFraction) === 'coarse' && band(e.total) === b)
  const fm = f.length ? median(f.map(e => e.relief)) : null
  const cm = c.length ? median(c.map(e => e.relief)) : null
  if (fm === null || cm === null) {
    console.log(`   ${b.padStart(6)} mm   fine n=${String(f.length).padStart(4)} coarse n=${String(c.length).padStart(4)}   not enough in both classes`)
    continue
  }
  console.log(`   ${b.padStart(6)} mm   fine ${fmt(fm)}% (n=${f.length})   coarse ${fmt(cm)}% (n=${c.length})   difference ${fmt(cm - fm)} points`)
}
db.close()
