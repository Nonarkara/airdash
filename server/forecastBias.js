// CAMS PM2.5 bias correction — adjust the global model to local sensors.
//
// WHY. CAMS (via Open-Meteo) reads LOW against Thai ground stations: over
// 2,013 province-days in September 2026 the ground mean was 10.8 µg/m³ and
// CAMS 7.2 (ratio 1.51). Uncorrected, "tomorrow" looked cleaner than today
// almost everywhere, so the dashboard said "improving" when it wasn't — the
// wrong message to carry into a haze season. Under-reading is also what the
// literature reports for CAMS over mainland SE Asia in burning season.
//
// METHOD (simple model-output statistics). Per province, over the last
// WINDOW_DAYS: ratio = Σ ground daily mean / Σ CAMS same-day mean, using only
// days where both exist. Ground = air4thai PM2.5 station readings; CAMS =
// pm25_fc_24h, which is the mean of TODAY's hours (the source requests
// timezone=Asia/Bangkok, so hour 0 is local midnight). A province with fewer
// than MIN_DAYS paired days uses the national ratio; the ratio is clamped so
// one bad sensor cannot multiply a forecast by 10. The raw CAMS value stays
// in the DB (skill.js scores the raw model) and is returned alongside.
//
// BOUNDED EXTRAPOLATION (2026-09-28). A ratio learned on clean days is mostly
// a LOCAL offset (Rayong: ground ~10 vs CAMS ~3.5 → ratio 2.9 — that is Map
// Ta Phut, not a model that is 3× low at every level). Scaling a higher
// forecast by it overshoots: raw 14 became "41 µg/m³", which crossed the
// warning line and was broadcast. So the ratio applies only up to the mean
// CAMS level it was learned on; beyond that the calibrated ABSOLUTE offset
// is added instead. The range grows by itself once smoky days enter the
// 14-day window.
const WINDOW_DAYS = 14
const MIN_DAYS = 5
const RATIO_MIN = 0.5
const RATIO_MAX = 3
const TTL_MS = 60 * 60_000
const VALID_MAX_UG = 500 // above this a station reading is a fault, not air

const clampRatio = (r) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, r))

/** Pure: ratios from paired daily means.
 *  ground/cams rows: { code, day, v }. Returns { byCode: Map, national }. */
export function computeRatios(groundRows, camsRows, { minDays = MIN_DAYS } = {}) {
  const cams = new Map(camsRows.filter((r) => r.v > 0).map((r) => [`${r.code}|${r.day}`, r.v]))
  const acc = new Map() // code → { g, c, n }
  let G = 0, C = 0, N = 0
  for (const r of groundRows) {
    if (!(r.v > 0)) continue
    const c = cams.get(`${r.code}|${r.day}`)
    if (!(c > 0)) continue
    const a = acc.get(r.code) ?? { g: 0, c: 0, n: 0 }
    acc.set(r.code, { g: a.g + r.v, c: a.c + c, n: a.n + 1 })
    G += r.v; C += c; N++
  }
  const national = N >= minDays && C > 0
    ? { ratio: round2(clampRatio(G / C)), n: N, scope: 'national', camsMean: C / N }
    : { ratio: 1, n: N, scope: 'none', camsMean: 0 }
  const byCode = new Map()
  for (const [code, a] of acc) {
    if (a.n >= minDays && a.c > 0) byCode.set(code, { ratio: round2(clampRatio(a.g / a.c)), n: a.n, scope: 'province', camsMean: a.c / a.n })
  }
  return { byCode, national }
}

const round2 = (x) => Math.round(x * 100) / 100
const localDaysAgo = (days, now = Date.now()) =>
  new Date(now + 7 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10)

function load(db) {
  const since = localDaysAgo(WINDOW_DAYS)
  const groundRows = db.all(
    `SELECT s.province_code AS code, substr(r.obs_time, 1, 10) AS day, AVG(r.value) AS v
       FROM readings r JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
      WHERE r.metric = 'pm25' AND r.source = 'air4thai' AND r.obs_time >= ?
        AND r.value > 0 AND r.value < ? AND s.province_code IS NOT NULL
      GROUP BY s.province_code, day`, since, VALID_MAX_UG)
  const camsRows = db.all(
    `SELECT station_key AS code, substr(obs_time, 1, 10) AS day, AVG(value) AS v
       FROM readings
      WHERE metric = 'pm25_fc_24h' AND source = 'openmeteo_aq' AND obs_time >= ?
      GROUP BY station_key, day`, since)
  return computeRatios(groundRows.map((r) => ({ ...r, code: String(r.code) })), camsRows.map((r) => ({ ...r, code: String(r.code) })))
}

/** Pure: ratio inside the calibrated range, absolute offset beyond it. */
export function correct(v, { ratio, camsMean = 0 }) {
  if (!(camsMean > 0) || v <= camsMean) return v * ratio
  return v + (ratio - 1) * camsMean
}

const cache = new WeakMap() // db → { at, ratios }

/** Per-DB cached bias model. Never throws: on failure the forecast passes through raw. */
export function forecastBias(db) {
  let c = cache.get(db)
  if (!c || Date.now() - c.at > TTL_MS) {
    let ratios
    try { ratios = load(db) } catch { ratios = { byCode: new Map(), national: { ratio: 1, n: 0, scope: 'none' } } }
    c = { at: Date.now(), ratios }
    cache.set(db, c)
  }
  const { byCode, national } = c.ratios
  const ratioFor = (code) => byCode.get(String(code)) ?? national
  return {
    ratioFor,
    /** Bias-corrected value (null stays null). */
    adjust: (code, v) => (v === null || v === undefined || !Number.isFinite(v) ? v ?? null : round1(correct(v, ratioFor(code)))),
    national,
    provinces: byCode.size,
  }
}

const round1 = (x) => Math.round(x * 10) / 10
