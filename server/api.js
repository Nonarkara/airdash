// JSON + SSE API surface consumed by the dashboard frontend.
import { json, readBody, prebuild, sendPrebuilt, sendFile, SECURITY_HEADERS } from './http.js'
import { allow } from './ratelimit.js'
import { CONFIG } from './config.js'
import { buildCascade } from './cascade.js'
import { WETNESS_LABELS } from './wetness.js'
import { ensureSheltersLoaded, ingestShelters, nearestShelters, sheltersInBbox, sheltersInProvince, SHELTER_SOURCE } from './shelters.js'
import { classifyOni } from './sources/enso.js'
import { FOCUS_AREAS } from './focus.js'
import { SOURCES, EXPORT_INFO } from './sources-catalog.js'
import { listExportDays, buildDailyExport, dailyToCsv, buildFullExport, fullToCsv } from './export.js'
import { listWeeklyExports, getExportPath, buildWeeklyExport as buildWeeklyExportJob, startWeeklyBuild, getBuildState } from './weeklyExport.js'
import { libraryToc, searchLibrary, libraryDoc } from './library.js'
import { searchGazetteer, placeDetail, searchTambons, searchDistricts, lookupPostal, lookupPlace } from './gazetteer.js'
import { provinceVerdict, riverEta } from './verdict.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEO_DIR = join(__dirname, '..', 'public', 'geo')
const provinceBoundariesGeoJson = JSON.parse(
  readFileSync(join(GEO_DIR, 'province-boundaries.geojson'), 'utf8'))
import { buildInsights } from './insights.js'
import { log } from './util.js'
import { sensorHealth } from './sensors.js'

// Cache for /api/series/daily — its GROUP BYs scan the huge readings table and
// would freeze the synchronous event loop on every OVERVIEW load otherwise.
const seriesDailyCache = new Map() // days -> { at, payload }
const SERIES_DAILY_TTL_MS = 30 * 60_000 // daily bars barely move intraday; recompute rarely

// Pre-gzipped snapshot bytes, shared across concurrent clients (SSE keeps them
// live between fetches, so a few seconds of staleness is invisible).
let snapshotCache = null // { at, built:{ body, gz } }
const SNAPSHOT_TTL_MS = 6_000

// Cache for /api/insights — buildInsights + sensorHealth scan readings and cost
// ~0.7s; without a cache, N concurrent loads each recompute serially on the one
// event loop. Insights move on the ingest cadence (minutes), so short staleness
// is invisible. One computed payload is shared across all clients.
let insightsCache = null // { at, payload }
const INSIGHTS_TTL_MS = 60_000

const clamp = (n, lo, hi, dflt) => {
  // Number(null) === 0, so an absent query param must fall back explicitly.
  if (n === null || n === undefined || n === '') return dflt
  const v = Number(n)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt
}

/** Escape LIKE wildcards so user input is matched literally. */
function escapeLike(q) {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`)
}

function safeMeta(json) {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

/** Pivot latest-readings rows into one object per station. */
function pivotLatest(db, source, metrics) {
  const placeholders = metrics.map(() => '?').join(',')
  const rows = db.all(
    `SELECT l.station_key, l.metric, l.value, l.obs_time,
            s.name_th, s.name_en, s.province_th, s.province_en, s.province_code,
            s.region_th, s.region_en, s.basin_th, s.basin_en, s.lat, s.lng, s.meta_json
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
     WHERE l.source = ? AND l.metric IN (${placeholders})`,
    source, ...metrics,
  )
  const byStation = new Map()
  for (const r of rows) {
    let st = byStation.get(r.station_key)
    if (!st) {
      st = {
        key: r.station_key, name_th: r.name_th, name_en: r.name_en,
        province_th: r.province_th, province_en: r.province_en, province_code: r.province_code,
        region_th: r.region_th, region_en: r.region_en, basin_th: r.basin_th, basin_en: r.basin_en,
        lat: r.lat, lng: r.lng, meta: safeMeta(r.meta_json),
        obs_time: r.obs_time,
      }
      byStation.set(r.station_key, st)
    }
    st[r.metric] = r.value
    if (r.obs_time > st.obs_time) st.obs_time = r.obs_time
  }
  return [...byStation.values()]
}

export function buildRoutes({ db, bus, scheduler, riskEngine, wetness, rag, faq, startedAt }) {
  return {
    'GET /api/sensors/health': (req, res) => {
      json(res, 200, sensorHealth(db))
    },

    // CSV export of suspect stations for field crews to print and
    // tick off as they go physically fix the gauges. Audit
    // recommendation: "the dead sensor is more useful as a list of
    // things to dispatch crews to, not just a number on the dashboard".
    // One row per flagged station with all the coordinates + flags
    // a field tech needs on a printout. UTF-8 BOM for Excel.
    'GET /api/sensors/dead.csv': (req, res) => {
      const h = sensorHealth(db)
      const rows = [
        ['source', 'station_key', 'name_th', 'name_en', 'province_th',
         'province_en', 'lat', 'lng', 'last_seen', 'age_hours',
         'flags', 'metric', 'value', 'body_th', 'body_en'],
      ]
      const flagSet = (flags) => (flags ?? []).join('|')
      for (const arr of [h.by_flag.stale, h.by_flag.flatline, h.by_flag.outlier, h.by_flag.mismatch]) {
        for (const s of arr) {
          rows.push([
            s.source ?? '',
            s.station_key ?? '',
            s.name_th ?? '',
            s.name_en ?? '',
            s.province_th ?? '',
            s.province_en ?? '',
            s.lat ?? '',
            s.lng ?? '',
            s.last_seen ?? '',
            s.age_hours ?? '',
            flagSet(s.flags),
            s.metric ?? '',
            s.value ?? '',
            s.body_th ?? '',
            s.body_en ?? '',
          ])
        }
      }
      const escape = (v) => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csv = '\uFEFF' + rows.map((r) => r.map(escape).join(',')).join('\n') + '\n'
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="flooddash-dead-sensors-${new Date().toISOString().slice(0, 10)}.csv"`,
      })
      res.end(csv)
    },

    'GET /api/health': (req, res) => {
      const dbStats = {}
      // These tables are small (≤ tens of thousands of rows) — COUNT is fast.
      for (const table of ['stations', 'events', 'alerts', 'news_items', 'rag_docs', 'readings_hourly']) {
        dbStats[table] = db.get(`SELECT COUNT(*) AS n FROM ${table}`).n
      }
      // readings has millions of rows. COUNT(*) is a full-table scan that
      // took ~8s here — and node:sqlite is synchronous, so it froze the whole
      // event loop on every health poll (watchdog + tunnel proxy), which
      // stalled real traffic into 502s. MAX(id) is O(1) on the integer PK; as
      // a health diagnostic an approximate total is fine (exact until the
      // first retention prune, a harmless over-count after).
      dbStats.readings = db.get('SELECT MAX(id) AS n FROM readings').n ?? 0
      const dbSize = db.get(
        'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').bytes
      json(res, 200, {
        ok: true,
        service: 'flooddash',
        now: new Date().toISOString(),
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
        db: { ...dbStats, size_mb: Math.round(dbSize / 1048576 * 10) / 10 },
        sources: scheduler.health(),
        sse: bus.stats(),
        llm: rag.status(),
      })
    },

    // The snapshot is 1.3MB and identical for every client at a given moment.
    // Building it (several latest-table pivots) + JSON-stringify + gzip is all
    // synchronous, so under a burst of page loads it serialized on the event
    // loop and saturated the server (250 concurrent → connection failures).
    // Cache the pre-gzipped bytes for a few seconds: the SSE tap keeps clients
    // live between fetches, so 6s of staleness is invisible, and a burst now
    // serves one shared buffer at O(1) per request.
    'GET /api/snapshot': (req, res) => {
      if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
        return sendPrebuilt(res, 200, snapshotCache.built)
      }
      const risk = riskEngine.get()
      const water = pivotLatest(db, 'thaiwater_wl', ['situation_level', 'wl_msl', 'storage_pct'])
      const rain = pivotLatest(db, 'thaiwater_rain', ['rain_24h', 'rain_1h'])
        .filter((s) => (s.rain_24h ?? 0) >= 10 && s.lat !== null)
      const dams = pivotLatest(db, 'thaiwater_dam',
        ['dam_storage_pct', 'dam_storage_mcm', 'dam_inflow_mcm', 'dam_released_mcm'])
      const aqi = pivotLatest(db, 'air4thai', ['aqi', 'pm25'])
      const reservoirs = pivotLatest(db, 'rid_reservoir', ['rsv_storage_pct', 'rsv_volume_mcm'])
        .sort((a, b) => (b.rsv_storage_pct ?? 0) - (a.rsv_storage_pct ?? 0))
      const alerts = db.all('SELECT * FROM alerts ORDER BY id DESC LIMIT 20')
      const news = db.all('SELECT feed, title, link, published_at FROM news_items ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT 15')
      const built = prebuild({
        now: new Date().toISOString(),
        risk, water, rain, dams, reservoirs, aqi, alerts, news,
        sources: scheduler.health(),
      })
      snapshotCache = { at: Date.now(), built }
      sendPrebuilt(res, 200, built)
    },

    'GET /api/risk': (req, res) => json(res, 200, riskEngine.get()),

    // National daily aggregates — feeds the ANALYTICS (default OVERVIEW) tab.
    // Each of these three GROUP BYs scans the recent slice of the multi-million
    // row readings table (~3s even with an index). node:sqlite is synchronous,
    // so running them per-request froze the event loop on every page load and
    // stalled real traffic. Daily granularity changes slowly, so the whole
    // result is cached in-memory with a TTL — the scan happens at most once per
    // window, off the hot path.
    'GET /api/series/daily': (req, res, url) => {
      const days = clamp(url.searchParams.get('days'), 1, 90, 14)
      const cached = seriesDailyCache.get(days)
      if (cached && Date.now() - cached.at < SERIES_DAILY_TTL_MS) {
        return json(res, 200, cached.payload)
      }
      const rainRows = db.all(
        `SELECT substr(obs_time, 1, 10) AS date,
                MAX(value) AS max_mm, AVG(value) AS avg_mm, COUNT(*) AS n
           FROM readings
          WHERE metric = 'rain_24h' AND obs_time >= date('now', ?)
          GROUP BY date ORDER BY date DESC LIMIT ?`,
        `-${days} days`, days)
      const wlRows = db.all(
        `SELECT substr(obs_time, 1, 10) AS date,
                SUM(CASE WHEN value >= 4 THEN 1 ELSE 0 END) AS l4_plus,
                SUM(CASE WHEN value >= 5 THEN 1 ELSE 0 END) AS l5
           FROM readings
          WHERE metric = 'situation_level' AND obs_time >= date('now', ?)
          GROUP BY date ORDER BY date DESC LIMIT ?`,
        `-${days} days`, days)
      const damRows = db.all(
        `SELECT substr(obs_time, 1, 10) AS date,
                SUM(CASE WHEN value >= 90 THEN 1 ELSE 0 END) AS hot
           FROM readings
          WHERE metric = 'dam_storage_pct' AND obs_time >= date('now', ?)
          GROUP BY date ORDER BY date DESC LIMIT ?`,
        `-${days} days`, days)
      const payload = { days, rain: rainRows, water: wlRows, dams: damRows }
      seriesDailyCache.set(days, { at: Date.now(), payload })
      json(res, 200, payload)
    },

    // Real-time analytics — curated patterns from the 9-source pipeline.
    // Returns a sorted list of operator-actionable insights (compound events,
    // upstream surges, basin escalation, sudden score jumps, dam spillways,
    // silent sensors, data-quality warnings). Each insight has a single
    // sentence title + body in both languages and a `heat` score for ordering.
    'GET /api/insights': (req, res) => {
      if (insightsCache && Date.now() - insightsCache.at < INSIGHTS_TTL_MS) {
        return json(res, 200, insightsCache.payload)
      }
      const risk = riskEngine.get()
      const insights = buildInsights({ db, risk })
      const byType = {}
      for (const i of insights) byType[i.type] = (byType[i.type] ?? 0) + 1
      const payload = {
        fetched_at: new Date().toISOString(),
        insights,
        summary: { total: insights.length, by_type: byType, by_severity: {
          critical: insights.filter((i) => i.severity === 'critical').length,
          warn: insights.filter((i) => i.severity === 'warn').length,
          info: insights.filter((i) => i.severity === 'info').length,
        } },
        method_th: 'สัญญาณเรียลไทม์ 7 แบบ จากข้อมูลจริง 10 แหล่ง — รวมตรวจสอบคุณภาพเซ็นเซอร์ (เงียบ/ค้าง/ผิดปกติ/ไม่สอดคล้อง) เพื่อให้รู้ว่าควรสงสัยข้อมูลตรงไหน',
        method_en: '7 real-time signal families from 10 live pipelines — including sensor-quality checks (stale, flatline, outlier, mismatch) so you know which readings to doubt.',
      }
      insightsCache = { at: Date.now(), payload }
      json(res, 200, payload)
    },

    // 3-day forecast view — replays the watch score with the Open-Meteo
    // forecast rain (d0/d1/d2) replacing the observed rain, per horizon.
    // Water/forecast/weights stay the same; only the rain component changes.
    // The same score formula the live indicator uses — we just swap inputs.
    'GET /api/forecast': (req, res) => {
      const risk = riskEngine.get()
      const horizons = [
        { hours: 0,  label_th: 'ตอนนี้',     label_en: 'NOW'    },
        { hours: 24, label_th: '+24 ชม.',   label_en: '+24h'   },
        { hours: 48, label_th: '+48 ชม.',   label_en: '+48h'   },
        { hours: 72, label_th: '+72 ชม.',   label_en: '+72h'   },
      ]
      // Mirror the helper scores from server/risk.js so the bands line up.
      const rainScore = (mm) => {
        if (mm > 135) return 95
        if (mm > 90)  return 80
        if (mm > 35)  return 45
        if (mm > 10)  return 15
        return 0
      }
      const forecastScore = (mm48) => {
        if (mm48 >= 150) return 90
        if (mm48 >= 90)  return 70
        if (mm48 >= 35)  return 40
        if (mm48 >= 10)  return 15
        return 0
      }
      const bandOf = (s) => {
        const b = CONFIG.risk.bands
        if (s >= b.high)     return 'high'
        if (s >= b.elevated) return 'elevated'
        if (s >= b.watch)    return 'watch'
        return 'normal'
      }
      const w = CONFIG.risk.weights
      // Forecast rows: latest 3 days' precip per province.
      const fcRows = db.all(
        `SELECT l.station_key AS province_code, l.metric, l.value
         FROM latest l
         WHERE l.source = 'openmeteo'
           AND l.metric IN ('precip_fc_d0','precip_fc_d1','precip_fc_d2','precip_fc_48h')`)
      const byProv = new Map()
      for (const r of fcRows) {
        let p = byProv.get(r.province_code)
        if (!p) byProv.set(r.province_code, p = {})
        p[r.metric] = r.value
      }
      const provinces = risk.provinces.map((rp) => {
        const fc = byProv.get(rp.province_code) || {}
        const d0 = fc.precip_fc_d0 ?? 0
        const d1 = fc.precip_fc_d1 ?? 0
        const d2 = fc.precip_fc_d2 ?? 0
        const fc48 = fc.precip_fc_48h ?? (d0 + d1)
        // For each horizon, replace observed rain with cumulative forecast rain
        // up to that point. Water + wetness + rise stay (they don't change in
        // 24/48/72h without more data — operator interpretation: the rain is
        // what changes, the rest is "ground truth from now").
        const rain24 = d0
        const rain48 = d0 + d1
        const rain72 = d0 + d1 + d2
        // Forecast component: use the same 48h-window logic as the live score,
        // scaled by the horizon length.
        const fc24 = forecastScore(rain24 * 2)
        const fc48s = forecastScore(rain48)
        const fc72 = forecastScore(rain72 * 2 / 3) // 72h × (48h/72h) scaling
        const scores = {
          now:  rp.score,
          p24h: Math.round(w.water * rp.water + w.rain * rainScore(rain24) + w.forecast * fc24 + w.wetness * rp.wetness_score + w.riseRate * rp.rise_score),
          p48h: Math.round(w.water * rp.water + w.rain * rainScore(rain48) + w.forecast * fc48s + w.wetness * rp.wetness_score + w.riseRate * rp.rise_score),
          p72h: Math.round(w.water * rp.water + w.rain * rainScore(rain72) + w.forecast * fc72 + w.wetness * rp.wetness_score + w.riseRate * rp.rise_score),
        }
        return {
          code: rp.province_code,
          name_th: rp.province_th, name_en: rp.province_en,
          lat: rp.lat, lng: rp.lng,
          forecast: { d0: Math.round(d0*10)/10, d1: Math.round(d1*10)/10, d2: Math.round(d2*10)/10, mm48: Math.round(fc48*10)/10 },
          scores: {
            now:  scores.now,  band:  bandOf(scores.now),
            p24h: scores.p24h, b24h:  bandOf(scores.p24h),
            p48h: scores.p48h, b48h:  bandOf(scores.p48h),
            p72h: scores.p72h, b72h:  bandOf(scores.p72h),
          },
        }
      })
      // Top 5 escalators: provinces where +72h score is materially higher than now.
      const escalators = provinces
        .map((p) => ({ ...p, delta: p.scores.p72h - p.scores.now }))
        .filter((p) => p.delta > 0 && p.forecast.mm48 > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
      json(res, 200, {
        fetched_at: new Date().toISOString(),
        horizons,
        provinces,
        escalators,
        method_th: 'คะแนนเฝ้าระวัง = 0.40·น้ำ + 0.25·ฝน + 0.15·พยากรณ์ + 0.10·ความชุ่มน้ำ + 0.10·อัตราเพิ่มระดับน้ำ โดยฝนและพยากรณ์ถูกแทนที่ด้วยฝนสะสมตามช่วงเวลา (d0 / d0+d1 / d0+d1+d2)',
        method_en: 'Watch score = 0.40·water + 0.25·rain + 0.15·forecast + 0.10·wetness + 0.10·riseRate, with rain/forecast swapped for cumulative forecast rain per horizon (d0 / d0+d1 / d0+d1+d2)',
        disclaimer_th: 'ดัชนีบ่งชี้ ไม่ใช่แบบจำลองพยากรณ์ — น้ำ/ความชื้น/อัตราน้ำขึ้นคงที่ตามเวลาปัจจุบัน',
        disclaimer_en: 'Heuristic indicator, not a forecast model — water/wetness/riseRate held constant at current observation',
      })
    },

    // What-if: re-projects the watch score with a user-supplied 24h rain
    // (0-500mm). Water/wetness/riseRate/forecast held at current values.
    // Cheap endpoint — recomputes the score on the fly, no DB writes.
    'GET /api/whatif': (req, res, url) => {
      const rain = clamp(url.searchParams.get('rain'), 0, 500, 0)
      const risk = riskEngine.get()
      const rainScore = (mm) => {
        if (mm > 135) return 95
        if (mm > 90)  return 80
        if (mm > 35)  return 45
        if (mm > 10)  return 15
        return 0
      }
      const bandOf = (s) => {
        const b = CONFIG.risk.bands
        if (s >= b.high)     return 'high'
        if (s >= b.elevated) return 'elevated'
        if (s >= b.watch)    return 'watch'
        return 'normal'
      }
      const w = CONFIG.risk.weights
      const r = rainScore(rain)
      const list = risk.provinces.map((p) => {
        const newScore = Math.round(
          w.water * p.water + w.rain * r +
          w.forecast * p.forecast + w.wetness * p.wetness_score + w.riseRate * p.rise_score,
        )
        return {
          code: p.province_code,
          name_th: p.province_th, name_en: p.province_en,
          now: p.score, band_now: p.band,
          whatif: newScore, band_whatif: bandOf(newScore),
          delta: newScore - p.score,
        }
      })
      // Top 5 escalators
      const escalators = list
        .filter((p) => p.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
      // Aggregate summary
      const summary = { normal: 0, watch: 0, elevated: 0, high: 0, total: list.length }
      for (const p of list) summary[p.band_whatif] += 1
      json(res, 200, {
        rain_mm: rain,
        fetched_at: new Date().toISOString(),
        summary,
        escalators,
        provinces: list,
        method_th: 'ถ้าฝนตก ' + rain + ' มม. ใน 24 ชม. → คะแนนเฝ้าระวังใหม่ โดยเก็บน้ำ/ความชื้น/อัตราน้ำขึ้น/พยากรณ์ปัจจุบันไว้',
        method_en: 'If ' + rain + 'mm of rain in 24h → recompute watch score with water/wetness/riseRate/forecast held at current observation',
      })
    },

    // Connected waterways — reaches + cascade links + flagship Chao Phraya chain.
    'GET /api/rivers': (req, res) => json(res, 200, buildCascade(db)),

    // Antecedent Precipitation Index (catchment wetness) per province.
    'GET /api/wetness': (req, res) => {
      const all = [...wetness.all().values()].sort((a, b) => b.api - a.api)
      json(res, 200, {
        updated: new Date().toISOString(),
        method_th: 'ดัชนีฝนสะสมถ่วงเวลา (API_t = 0.92·API_{t-1} + ฝนวันนี้) — ดินยิ่งชุ่ม ฝนยิ่งกลายเป็นน้ำท่า',
        method_en: 'Antecedent Precipitation Index (API_t = 0.92·API_{t-1} + today rain) — wetter ground → more runoff',
        labels: WETNESS_LABELS,
        provinces: all,
      })
    },

    // ENSO seasonal modulator (El Niño / La Niña) — context, not prediction.
    'GET /api/enso': (req, res) => {
      const anom = Number(db.kvGet('enso_anom'))
      const cls = classifyOni(Number.isFinite(anom) ? anom : null)
      const series = db.all(
        "SELECT obs_time, value FROM readings WHERE source = 'enso' AND metric = 'oni_anom' ORDER BY obs_time DESC LIMIT 24")
        .reverse()
      json(res, 200, {
        anom: Number.isFinite(anom) ? anom : null,
        phase: cls.phase, label_th: cls.th, label_en: cls.en,
        season: db.kvGet('enso_season'),
        note_th: cls.phase.startsWith('la_nina')
          ? 'ลานีญาเพิ่มโอกาสฝนมากในหน้าฝน (ชัดสุดในภาคอีสาน) — น้ำท่วมใหญ่ปี 2554 เกิดช่วงลานีญา'
          : 'สถานะมหาสมุทรเป็นเพียงปัจจัยเสริม ไม่ใช่ตัวพยากรณ์',
        note_en: cls.phase.startsWith('la_nina')
          ? 'La Niña raises wet-season rain odds (clearest in the Northeast) — the 2011 flood was a La Niña event'
          : 'Ocean state is a risk modulator, not a predictor',
        series,
      })
    },

    // Focus areas — the "cities" manifest. One row = one focus button.
    'GET /api/focus': (req, res) => json(res, 200, { areas: FOCUS_AREAS }),

    // Data-source catalog for integrators + JAXA / remote-sensing reference.
    'GET /api/sources': (req, res) => json(res, 200, {
      updated: new Date().toISOString(),
      pipelines: SOURCES.filter((s) => s.kind === 'pipeline'),
      remote: SOURCES.filter((s) => s.kind !== 'pipeline'),
      export: EXPORT_INFO,
      jaxa: {
        portal: 'https://earth.jaxa.jp/en/data/index.html',
        api: 'https://data.earth.jaxa.jp/',
        ptree: 'https://www.eorc.jaxa.jp/ptree/',
        note_th: 'GSMaP (ฝนจากดาวเทียม) และ Himawari-9 จาก JAXA — แผนที่ใช้ GIBS WMTS (Web Mercator) ให้ตรงกับ basemap',
        note_en: 'JAXA GSMaP precipitation and Himawari-9 — map tiles via NASA GIBS WMTS (Web Mercator) aligned to the basemap',
      },
    }),

    // Historical daily exports compiled from our SQLite collection.
    'GET /api/export/days': (req, res, url) => {
      const limit = clamp(url.searchParams.get('limit'), 1, 730, 365)
      json(res, 200, { days: listExportDays(db, limit), export: EXPORT_INFO })
    },

    'GET /api/export/daily': (req, res, url) => {
      const day = (url.searchParams.get('date') ?? '').trim()
      const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(res, 400, { error: 'date required (YYYY-MM-DD)' })
      try {
        const bundle = buildDailyExport(db, day)
        if (format === 'csv') {
          res.writeHead(200, {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="flooddash-${day}.csv"`,
            'cache-control': 'public, max-age=3600',
          })
          res.end('\uFEFF' + dailyToCsv(bundle))
          return
        }
        json(res, 200, bundle)
      } catch (err) {
        json(res, 400, { error: String(err?.message ?? err) })
      }
    },

    'GET /api/export/full': (req, res, url) => {
      const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv'
      try {
        const bundle = buildFullExport(db)
        if (format === 'json') return json(res, 200, bundle)
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="flooddash-full-dataset.csv"',
          'cache-control': 'public, max-age=600',
        })
        res.end('\uFEFF' + fullToCsv(bundle))
      } catch (err) {
        json(res, 500, { error: String(err?.message ?? err) })
      }
    },

    'GET /api/series': (req, res, url) => {
      const source = url.searchParams.get('source')
      const station = url.searchParams.get('station')
      const metric = url.searchParams.get('metric')
      if (!source || !station || !metric) return json(res, 400, { error: 'source, station, metric required' })
      const hours = clamp(url.searchParams.get('hours'), 1, 24 * 365, 72)
      const cutoffLocal = new Date(Date.now() + 7 * 3600_000 - hours * 3600_000).toISOString().slice(0, 16)
      const raw = db.all(
        `SELECT obs_time, value FROM readings
         WHERE source = ? AND station_key = ? AND metric = ? AND obs_time >= ?
         ORDER BY obs_time`, source, station, metric, cutoffLocal)
      const hourly = db.all(
        `SELECT hour || ':00' AS obs_time, v_avg AS value FROM readings_hourly
         WHERE source = ? AND station_key = ? AND metric = ? AND hour >= ?
         ORDER BY hour`, source, station, metric, cutoffLocal.slice(0, 13))
      const seen = new Set(raw.map((r) => r.obs_time.slice(0, 13)))
      const merged = [...hourly.filter((h) => !seen.has(h.obs_time.slice(0, 13))), ...raw]
        .sort((a, b) => a.obs_time.localeCompare(b.obs_time))
      json(res, 200, { source, station, metric, hours, points: merged })
    },

    'GET /api/stations': (req, res, url) => {
      const q = (url.searchParams.get('q') ?? '').trim()
      if (!q) return json(res, 400, { error: 'q required' })
      const like = `%${escapeLike(q)}%`
      const rows = db.all(
        `SELECT source, station_key, name_th, name_en, province_th, province_en, lat, lng
         FROM stations
         WHERE name_th LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\'
            OR province_th LIKE ? ESCAPE '\\' OR province_en LIKE ? ESCAPE '\\'
         LIMIT 20`, like, like, like, like)
      json(res, 200, { q, results: rows })
    },

    'GET /api/alerts': (req, res, url) => {
      const limit = clamp(url.searchParams.get('limit'), 1, 500, 100)
      json(res, 200, { alerts: db.all('SELECT * FROM alerts ORDER BY id DESC LIMIT ?', limit) })
    },

    'GET /api/news': (req, res, url) => {
      const limit = clamp(url.searchParams.get('limit'), 1, 100, 30)
      json(res, 200, {
        news: db.all(
          'SELECT feed, title, link, published_at, fetched_at FROM news_items ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ?',
          limit),
      })
    },

    'GET /api/tap/recent': (req, res, url) => {
      const limit = clamp(url.searchParams.get('limit'), 1, 500, 200)
      const rows = db.all('SELECT * FROM events ORDER BY id DESC LIMIT ?', limit)
      json(res, 200, { events: rows.reverse().map((e) => bus.publicShape(e)) })
    },

    'GET /api/tap': (req, res) => {
      if (bus.stats().clients >= CONFIG.maxSseClients) {
        return json(res, 503, { error: 'too many live connections, retry shortly' })
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      res.write('retry: 3000\n\n')
      bus.subscribe(res, req.headers['last-event-id'])
    },

    // The Flood Library — bible + knowledge notes, searchable and rendered.
    'GET /api/library/toc': (req, res, url) => json(res, 200, libraryToc(db, url.searchParams.get('lang') === 'en' ? 'en' : 'th')),

    'GET /api/library/search': (req, res, url) => {
      const q = (url.searchParams.get('q') ?? '').trim()
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'th'
      const limit = clamp(url.searchParams.get('limit'), 1, 50, 20)
      json(res, 200, searchLibrary(db, { q, lang, limit }))
    },

    'GET /api/library/doc': (req, res, url) => {
      const key = (url.searchParams.get('key') ?? '').trim()
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'th'
      if (!key) return json(res, 400, { error: 'key required' })
      const doc = libraryDoc(db, { key, lang })
      if (!doc) return json(res, 404, { error: 'not found' })
      json(res, 200, doc)
    },

    // Universal place search — provinces, stations, focus areas in one index.
    'GET /api/search': (req, res, url) => {
      const q = url.searchParams.get('q') ?? ''
      const limit = clamp(url.searchParams.get('limit'), 1, 50, 20)
      json(res, 200, searchGazetteer(db, { q, limit }))
    },

    // Place detail — nearest stations, forecast, context for a lat/lng.
    'GET /api/place': (req, res, url) => {
      const lat = Number(url.searchParams.get('lat'))
      const lng = Number(url.searchParams.get('lng'))
      const province_th = url.searchParams.get('province') ?? null
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json(res, 400, { error: 'lat and lng required' })
      }
      const radius = clamp(url.searchParams.get('radius'), 5, 100, 30)
      const detail = placeDetail(db, { lat, lng, province_th, radius_km: radius })
      // The "so what" layer: plain-language verdict + river time-to-impact.
      // Try exact province name first; if that fails (district/tambon search
      // where province_th doesn't match the risk engine's list), fall back
      // to the nearest province by centroid so the verdict is never blank.
      const risk = riskEngine.get()
      let prov = province_th
        ? risk.provinces.find((x) => x.province_th === province_th) ?? null
        : null
      if (!prov && Number.isFinite(lat) && Number.isFinite(lng)) {
        let best = null, bd = Infinity
        for (const p of risk.provinces) {
          if (p.province_code === '99' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
          const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
          if (d < bd) { bd = d; best = p }
        }
        prov = best
      }
      const eta = riverEta(db, lat, lng)
      // Satellite rain (IMERG) for the province, if the source is configured —
      // catches rain falling where no gauge is reporting.
      const sat = prov?.province_code
        ? db.get(`SELECT value, obs_time FROM latest
                   WHERE source = 'imerg' AND station_key = ? AND metric = 'sat_rain_mmh'`,
                 String(prov.province_code)) ?? null
        : null
      detail.river_eta = eta
      detail.sat_rain = sat
      // Pass the actual nearest stations so the verdict catches an overflowing
      // river near this city even when it sits across a province border.
      detail.verdict = provinceVerdict(prov, eta, sat, detail.nearest_water)
      json(res, 200, detail)
    },

    // Direct tambon / district search (sub-route of the universal search).
    // Kept as separate endpoints for clients that want only admin-level hits.
    'GET /api/search/tambons': (req, res, url) => {
      const q = url.searchParams.get('q') ?? ''
      const lang = url.searchParams.get('lang') === 'th' ? 'th' : 'en'
      const limit = clamp(url.searchParams.get('limit'), 1, 50, 12)
      if (q.length < 2) return json(res, 200, { q, results: [] })
      json(res, 200, { q, results: searchTambons(q, lang, limit) })
    },
    'GET /api/search/districts': (req, res, url) => {
      const q = url.searchParams.get('q') ?? ''
      const lang = url.searchParams.get('lang') === 'th' ? 'th' : 'en'
      const limit = clamp(url.searchParams.get('limit'), 1, 50, 12)
      if (q.length < 2) return json(res, 200, { q, results: [] })
      json(res, 200, { q, results: searchDistricts(q, lang, limit) })
    },

    // Postal-code lookup — 5 digits → tambon / district / province.
    // Every Thai postal code maps to exactly one tambon, so this is the
    // primary "I don't know my tambon name but I know my zip" path.
    'GET /api/postal': (req, res, url) => {
      const lang = url.searchParams.get('lang') === 'th' ? 'th' : 'en'
      const zip = url.searchParams.get('zip') ?? url.searchParams.get('q') ?? ''
      json(res, 200, { zip, results: lookupPostal(zip, lang) })
    },

    // Deep-link place: ?kind=tambon&code=110101 → returns one row.
    'GET /api/lookup': (req, res, url) => {
      const kind = url.searchParams.get('kind')
      const code = url.searchParams.get('code')
      if (!kind || !code) return json(res, 400, { error: 'kind and code required' })
      const lang = url.searchParams.get('lang') === 'th' ? 'th' : 'en'
      json(res, 200, { result: lookupPlace(code, kind, lang) })
    },

    // Province boundary GeoJSON — 77 features, served from the open mirror
    // (chingchai/OpenGISData-Thailand, CC-BY 4.0) and merged into the
    // risk layer so provinces get a colored choropleth overlay. Static
    // cache, ~1.6 MB, but easy to gzip at the edge.
    'GET /api/province-boundaries': (req, res) => {
      res.writeHead(200, {
        'content-type': 'application/geo+json',
        'cache-control': 'public, max-age=86400',
      })
      res.end(JSON.stringify(provinceBoundariesGeoJson))
    },

    'GET /api/chat/status': (req, res) => json(res, 200, rag.status()),

    'POST /api/chat': async (req, res) => {
      // The local LLM call is the single most expensive thing this server
      // does — a tighter per-IP window than the general limit.
      if (!allow(req, { key: 'chat', limit: 10, windowMs: 60_000 })) {
        return json(res, 429, { error: 'too many chat requests, slow down' })
      }
      let body
      try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON body' }) }
      const message = typeof body?.message === 'string' ? body.message.trim() : ''
      const lang = body?.lang === 'en' ? 'en' : 'th'
      if (!message || message.length > 2000) return json(res, 400, { error: 'message required (≤2000 chars)' })
      await rag.chat({ req, message, lang, res })
    },

    // ── FAQ cache + chat telemetry (admin / operator surfaces) ───────────
    // These can rewrite what the chatbot tells users or read every question
    // ever asked — gated on the X-Admin-Token header (see server/faq.js).
    // Feedback (below) is the one end-user-facing exception: any chat
    // visitor rating their own answer, not an operator action.
    'GET /api/chat/faqs': (req, res, url) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      const lang = url.searchParams.get('lang')
      const onlyApproved = url.searchParams.get('approved') === '1'
      const limit = clamp(url.searchParams.get('limit'), 1, 200, 50)
      json(res, 200, { faqs: faq.listFaqs({ lang, onlyApproved, limit }) })
    },
    'GET /api/chat/logs': (req, res, url) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      const limit = clamp(url.searchParams.get('limit'), 1, 500, 50)
      const servedFrom = url.searchParams.get('served_from')
      json(res, 200, { logs: faq.recentLogs({ limit, servedFrom }) })
    },
    'POST /api/chat/faqs/cluster': async (req, res) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      // Manual trigger of the daily cluster pass.
      const out = await faq.clusterRecent()
      json(res, 200, out)
    },
    'POST /api/chat/faqs/:id/approve': async (req, res, url) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      const id = Number(url.searchParams.get(':id'))
      let body
      try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
      if (!body?.response_template || body.response_template.length < 5) {
        return json(res, 400, { error: 'response_template required (≥5 chars)' })
      }
      json(res, 200, { faq: faq.approve(id, body.response_template) })
    },
    'POST /api/chat/faqs/:id/reject': async (req, res, url) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      const id = Number(url.searchParams.get(':id'))
      faq.reject(id)
      json(res, 200, { ok: true })
    },
    'POST /api/chat/faqs/:id': async (req, res, url) => {
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      // Edit the response_template without changing approval.
      const id = Number(url.searchParams.get(':id'))
      let body
      try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
      if (!body?.response_template) return json(res, 400, { error: 'response_template required' })
      faq.setResponse(id, body.response_template)
      json(res, 200, { ok: true })
    },
    'POST /api/chat/logs/:id/feedback': async (req, res, url) => {
      const id = Number(url.searchParams.get(':id'))
      let body
      try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
      const v = Number(body?.value)
      if (v !== 1 && v !== -1 && v !== 0) return json(res, 400, { error: 'value must be 1, -1, or 0' })
      faq.recordFeedback(id, v)
      json(res, 200, { ok: true })
    },

    // ── Shelters (DDPM, data.go.th) ──────────────────────────────────
    // The endpoint that powers "where do I go?" in the citizen hero. Lazy-
    // loaded on first hit; daily cron keeps the local SQLite fresh.
    'GET /api/shelters': (req, res, url) => {
      ensureSheltersLoaded(db)
      const province = url.searchParams.get('province')
      if (province) {
        return json(res, 200, {
          source: SHELTER_SOURCE,
          count: sheltersInProvince(db, province, 200).length,
          shelters: sheltersInProvince(db, province, 200),
        })
      }
      const bbox = url.searchParams.get('bbox')
      if (bbox) {
        const parts = bbox.split(',').map(Number)
        if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
          return json(res, 400, { error: 'bbox must be lat_min,lng_min,lat_max,lng_max' })
        }
        return json(res, 200, {
          source: SHELTER_SOURCE,
          shelters: sheltersInBbox(db, parts, 500),
        })
      }
      // Default: a sample (first 50) so the dashboard has something to show
      // on first load. The map frontend calls with bbox for the visible
      // viewport.
      const all = db.all(`SELECT id, place, province_th, district_th, lat, lng, capacity
                          FROM shelters WHERE source = ? LIMIT 50`, SHELTER_SOURCE)
      json(res, 200, { source: SHELTER_SOURCE, sample: true, shelters: all })
    },

    // K-nearest shelters to a point — the citizen hero "ศูนย์พักพิงใกล้คุณ"
    // call. `province` is optional; if provided, restricts the result to
    // shelters inside the user's province (a citizen of Trat doesn't want to
    // see Buriram shelters even if they're closer in straight-line km).
    'GET /api/shelters/nearest': (req, res, url) => {
      ensureSheltersLoaded(db)
      const lat = Number(url.searchParams.get('lat'))
      const lng = Number(url.searchParams.get('lng'))
      const limit = Math.min(20, Number(url.searchParams.get('limit')) || 5)
      const province = url.searchParams.get('province')
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json(res, 400, { error: 'lat and lng required' })
      }
      let rows = nearestShelters(db, lat, lng, limit)
      if (province) {
        // Re-rank: prefer same-province shelters, then fall back to nearest.
        const inProv = rows.filter((r) => r.province_th === province)
        const outOfProv = rows.filter((r) => r.province_th !== province)
        rows = [...inProv, ...outOfProv].slice(0, limit)
      }
      json(res, 200, {
        source: SHELTER_SOURCE,
        origin: { lat, lng },
        count: rows.length,
        shelters: rows,
      })
    },

    // Force a re-ingest (admin / cron endpoint). The daily cron will hit this.
    'POST /api/shelters/ingest': (req, res) => {
      const r = ingestShelters(db)
      if (r.ok) db.kvSet('shelters_loaded_at', new Date().toISOString())
      json(res, r.ok ? 200 : 500, r)
    },

    // ── LINE Notify opt-in ────────────────────────────────────────────
    // Citizen flow: paste a LINE Notify token (issued at
    // https://notify-bot.line.me after adding the bot as a friend).
    // Server validates by sending a tiny test push; if LINE accepts it,
    // the sub is saved. Otherwise the user sees the LINE error and can
    // retry with a corrected token. The actual alert pushes happen via
    // the line-push cron — not on this request — so the citizen's
    // subscription flow is decoupled from the alert fan-out.
    'POST /api/line/subscribe': async (req, res) => {
      const body = await readBody(req).catch(() => ({}))
      let parsed
      try { parsed = JSON.parse(body) } catch { return json(res, 400, { error: 'invalid JSON' }) }
      const { token, province_th, province_en, lang } = parsed
      if (!token || typeof token !== 'string' || token.length < 8) {
        return json(res, 400, { error: 'token required' })
      }
      if (!province_th) {
        return json(res, 400, { error: 'province_th required' })
      }
      // Validate the token: try a test message. If LINE rejects, the
      // user sees a clear error.
      try {
        const { sendLineNotify } = await import('./linePush.js')
        await sendLineNotify(token, `✅ FloodDash เชื่อมต่อสำเร็จ · connected to ${province_th}. จะส่งแจ้งเตือนเมื่อระดับเสี่ยง ACT NOW ขึ้นไป.`)
      } catch (err) {
        return json(res, 400, { error: 'LINE rejected token', detail: String(err.message ?? err) })
      }
      // Idempotent: if the same token is re-subscribed, update the row.
      const now = new Date().toISOString()
      const existing = db.get('SELECT id FROM line_subs WHERE token = ?', token)
      if (existing) {
        db.run(`UPDATE line_subs SET province_th = ?, province_en = ?, lang = ?,
                fail_count = 0, updated_at = ? WHERE id = ?`,
          province_th, province_en ?? null, lang ?? 'th', now, existing.id)
        return json(res, 200, { ok: true, updated: true })
      }
      db.run(`INSERT INTO line_subs (token, province_th, province_en, lang, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        token, province_th, province_en ?? null, lang ?? 'th', now, now)
      json(res, 200, { ok: true, created: true })
    },

    // Unsubscribe — used when a user clicks the cancel link in a push or
    // toggles the citizen panel switch off. Idempotent.
    'POST /api/line/unsubscribe': async (req, res) => {
      const body = await readBody(req).catch(() => ({}))
      let parsed
      try { parsed = JSON.parse(body) } catch { return json(res, 400, { error: 'invalid JSON' }) }
      const { token } = parsed
      if (!token) return json(res, 400, { error: 'token required' })
      const r = db.run('DELETE FROM line_subs WHERE token = ?', token)
      json(res, 200, { ok: true, deleted: r.changes })
    },

    // Diagnostic — count of active subs, last push time. Operator-facing.
    'GET /api/line/stats': (req, res) => {
      const total = db.get('SELECT COUNT(*) AS n FROM line_subs').n
      const last = db.kvGet('line_push_last_at')
      json(res, 200, { total_subs: total, last_push_at: last })
    },

    // Cron-callable tick — push to anyone whose province is in
    // elevated/high. Returns counts for ops dashboards.
    'POST /api/line/tick': async (req, res) => {
      const r = await tickLinePush(db)
      if (r.pushed > 0) db.kvSet('line_push_last_at', new Date().toISOString())
      json(res, 200, r)
    },

    // Sample push message for the UI preview — rendered in the citizen
    // panel so the user knows exactly what kind of message they'll get.
    'GET /api/line/preview': (req, res, url) => {
      const band = url.searchParams.get('band') || 'elevated'
      const province_th = url.searchParams.get('province_th') || 'ตราด'
      const province_en = url.searchParams.get('province_en') || 'Trat'
      const score = Number(url.searchParams.get('score')) || 76
      const lang = url.searchParams.get('lang') || 'th'
      json(res, 200, { message: buildMessage(province_th, province_en, band, score, lang) })
    },

    // ── Weekly data exports ─────────────────────────────────────────
    // Every Sunday the server dumps the full SQLite DB into a .tar.gz
    // (one CSV per table + a meta.json + a sidecar risk snapshot). The
    // last 8 weeks are kept. Public — anyone with the link can download.
    //
    //   GET  /api/exports              → list of available weekly archives
    //   GET  /api/exports/latest       → the newest archive (302 to it)
    //   GET  /api/exports/<filename>   → stream the .tar.gz
    //   POST /api/exports/build        → trigger a build now (admin token)
    'GET /api/exports': (req, res) => {
      const all = listWeeklyExports()
      const state = getBuildState()
      json(res, 200, { count: all.length, exports: all, build: state })
    },
    'GET /api/exports/latest': (req, res) => {
      const all = listWeeklyExports()
      if (!all.length) return json(res, 404, { error: 'no exports yet' })
      res.writeHead(302, { ...SECURITY_HEADERS, location: `/api/exports/${all[0].filename}` })
      res.end()
    },
    'GET /api/exports/:filename': (req, res, url) => {
      // The HTTP framework copies the matched :filename into the URL's
      // searchParams under the `:filename` key (see http.js), so we read
      // it from there rather than via a separate params argument.
      const filename = url.searchParams.get(':filename')
      const filePath = getExportPath(filename)
      if (!filePath) return json(res, 404, { error: 'export not found' })
      const sent = sendFile(res, filePath, {
        contentType: 'application/gzip',
        filename,
        cacheControl: 'public, max-age=3600',
      })
      if (!sent) return json(res, 500, { error: 'failed to send file' })
    },
    'POST /api/exports/build': (req, res) => {
      // Admin-gated. The weekly cron hits this same code path; the endpoint
      // exists so a human can force a build (after a schema change etc).
      // Building 4.6M readings rows takes ~45s, so the build runs in the
      // background and the HTTP response returns immediately with the
      // current build state. Poll /api/exports to see when it finishes.
      if (!faq.isAdmin(req)) return json(res, 401, { error: 'admin token required' })
      const r = startWeeklyBuild({ db, riskEngine, startedAt })
      json(res, 200, r)
    },
  }
}
