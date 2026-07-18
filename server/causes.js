// Cause Attribution engine — "WHY is the air bad HERE?" Per province, a
// ranked list of cause HYPOTHESES with confidence scores, computed only from
// data the system already holds (season window, region, PM2.5/PM10 ratio,
// NO2, CAMS dust forecast, stagnation, news keywords). This is honest
// circumstantial-evidence reasoning, not source apportionment — no chemical
// speciation, no receptor modelling. Every entry says so, and every evidence
// string cites the actual numbers used.
//
// Cause hypotheses:
//   burning        — open burning / wildfire smoke (dust season + north/NE
//                    region + เผา/ไฟป่า news mentions naming the province)
//   transboundary  — smoke advected across the border (border province +
//                    season + elevated PM with few LOCAL burning signals;
//                    southern provinces get the Aug–Oct Sumatra-haze window)
//   traffic        — urban combustion (metro province + fine-fraction
//                    PM2.5/PM10 ratio > 0.6 + NO2 present + weekday)
//   industry       — coarse mechanical dust, the Saraburi signature
//                    (PM10 high while PM2.5/PM10 ratio < 0.45)
//   desert_dust    — CAMS dust advection forecast ≥ 20 µg/m³
//   stagnation     — secondary: stagnation_comp ≥ 60 amplifies whichever
//                    primary cause is on top (nothing disperses the aerosol)
//
// Interface mirrors washout.js: createCauses(db, { riskEngine }) →
//   { all(): Map<province_code, entry>, forProvince(code) }
// entry: { province_code, province_th, province_en, pm25,
//          causes: [{ id, label_th, label_en, confidence, evidence:[{th,en}] }],
//          primary }
import { inDustSeasonWindow } from './risk.js'
import { num } from './util.js'

const CACHE_MS = 5 * 60_000
const FRESH_PM_HOURS = 6
const NEWS_WINDOW_DAYS = 3

// Thai official "17 northern provinces" (upper 9 + lower 8) — the burning-
// season heartland — plus the northeast (DOPA 30–49).
const NORTH_CODES = new Set(['50', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '67'])
const isNortheast = (code) => { const n = Number(code); return n >= 30 && n <= 49 }

// Border provinces on known transboundary-smoke corridors (Myanmar / Laos /
// Cambodia). Static, heuristic — being on the border is evidence, not proof.
const BORDER_CODES = new Set([
  '57', '58', '63', '50', '55', '56', // Myanmar/Laos north: Chiang Rai, Mae Hong Son, Tak, Chiang Mai, Nan, Phayao
  '42', '43', '38', '48', '49', '34', '33', '32', '27', // Laos/Cambodia NE-E: Loei, Nong Khai, Bueng Kan, Nakhon Phanom, Mukdahan, Ubon, Si Sa Ket, Surin, Sa Kaeo
  '71', '76', '77', '85', // Myanmar west: Kanchanaburi, Phetchaburi, Prachuap, Ranong
])
// Southern provinces exposed to the Aug–Oct Sumatra/Indonesia haze episodes.
const SOUTH_HAZE_CODES = new Set(['90', '91', '94', '95', '96'])

// Bangkok + vicinity — the traffic/urban-combustion signature region.
const METRO_CODES = new Set(['10', '11', '12', '13', '73', '74'])

const BURN_KEYWORDS = ['เผา', 'ไฟป่า', 'จุดความร้อน', 'หมอกควัน', 'hotspot', 'wildfire']

export const CAUSE_LABELS = {
  burning: { th: 'เผาในที่โล่ง/ไฟป่า', en: 'Open burning / wildfire smoke' },
  transboundary: { th: 'หมอกควันข้ามแดน', en: 'Transboundary haze' },
  traffic: { th: 'จราจร/การเผาไหม้ในเมือง', en: 'Traffic / urban combustion' },
  industry: { th: 'อุตสาหกรรม/โรงโม่ (ฝุ่นหยาบ)', en: 'Industry / quarry coarse dust' },
  desert_dust: { th: 'ฝุ่นทะเลทรายพัดพามา', en: 'Advected desert dust' },
  stagnation: { th: 'อากาศนิ่ง ฝุ่นสะสม', en: 'Stagnant air accumulating dust' },
}

const clamp01 = (x) => Math.max(0, Math.min(1, Math.round(x * 100) / 100))

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

/** Local (UTC+7) weekday: true Mon–Fri. */
function isLocalWeekday(date = new Date()) {
  const d = new Date(date.getTime() + 7 * 3600_000).getUTCDay()
  return d >= 1 && d <= 5
}

/** Local (UTC+7) calendar month 1–12. */
function localMonth(date = new Date()) {
  return new Date(date.getTime() + 7 * 3600_000).getUTCMonth() + 1
}

export function createCauses(db, { riskEngine }) {
  let cache = null
  let cacheAt = 0

  /** MAX value per province for the given air4thai metrics (fresh only). */
  function pollutantByProvince(metrics) {
    const placeholders = metrics.map(() => '?').join(',')
    const rows = db.all(
      `SELECT s.province_code, l.metric, MAX(l.value) AS value
       FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = 'air4thai' AND l.metric IN (${placeholders})
         AND l.obs_time >= ? AND s.province_code IS NOT NULL
       GROUP BY s.province_code, l.metric`,
      ...metrics, localCutoff(FRESH_PM_HOURS),
    )
    const out = new Map()
    for (const r of rows) {
      let p = out.get(r.province_code)
      if (!p) out.set(r.province_code, p = {})
      p[r.metric] = num(r.value)
    }
    return out
  }

  /** Burning-keyword hits in recent news: total + per-province-name counts. */
  function newsBurnSignals(provinces) {
    const rows = db.all(
      `SELECT title FROM news_items
       WHERE fetched_at >= datetime('now', ?) AND title IS NOT NULL`,
      `-${NEWS_WINDOW_DAYS} days`,
    )
    const burnTitles = rows
      .map((r) => r.title)
      .filter((t) => BURN_KEYWORDS.some((k) => t.toLowerCase().includes(k)))
    const perProvince = new Map()
    for (const p of provinces) {
      if (!p.province_th) continue
      const hits = burnTitles.filter((t) =>
        t.includes(p.province_th) || (p.province_en && t.includes(p.province_en))).length
      if (hits > 0) perProvince.set(p.province_code, hits)
    }
    return { national: burnTitles.length, perProvince }
  }

  function compute() {
    const risk = riskEngine.get()
    const pollByProv = pollutantByProvince(['pm10', 'no2'])
    const news = newsBurnSignals(risk.provinces)
    const inSeason = inDustSeasonWindow()
    const weekday = isLocalWeekday()
    const month = localMonth()

    const out = new Map()
    for (const p of risk.provinces) {
      const code = p.province_code
      if (!code) continue
      const pm25 = p.pm25
      const poll = pollByProv.get(code) ?? {}
      const pm10 = poll.pm10 ?? null
      const no2 = poll.no2 ?? null
      const ratio = pm25 !== null && pm10 !== null && pm10 > 0
        ? Math.round((pm25 / pm10) * 100) / 100 : null
      const provNews = news.perProvince.get(code) ?? 0
      const isNorth = NORTH_CODES.has(code)
      const isNE = isNortheast(code)

      const causes = []

      // ── burning / wildfire ────────────────────────────────────────────
      if (inSeason && (isNorth || isNE) && pm25 !== null && pm25 >= 25) {
        let conf = 0.3
        const ev = [{
          th: `ฤดูเผา (1 ธ.ค.–30 เม.ย.) + ${isNorth ? 'ภาคเหนือ' : 'ภาคอีสาน'} + PM2.5 ${pm25} µg/m³`,
          en: `Burning season (Dec 1–Apr 30) + ${isNorth ? 'northern' : 'northeastern'} region + PM2.5 ${pm25} µg/m³`,
        }]
        if (pm25 >= 37.5) conf += 0.15
        if (pm25 >= 75) conf += 0.1
        if (provNews >= 1) {
          conf += provNews >= 3 ? 0.3 : 0.2
          ev.push({
            th: `ข่าวเผา/ไฟป่า/จุดความร้อนที่เอ่ยชื่อจังหวัดนี้ ${provNews} ชิ้นใน ${NEWS_WINDOW_DAYS} วัน`,
            en: `${provNews} burning/wildfire/hotspot news item(s) naming this province in ${NEWS_WINDOW_DAYS} days`,
          })
        } else if (news.national >= 5) {
          conf += 0.05
          ev.push({
            th: `ข่าวเผา/ไฟป่าระดับประเทศ ${news.national} ชิ้นใน ${NEWS_WINDOW_DAYS} วัน`,
            en: `${news.national} national burning-related news items in ${NEWS_WINDOW_DAYS} days`,
          })
        }
        causes.push({ id: 'burning', confidence: clamp01(Math.min(conf, 0.9)), evidence: ev })
      }

      // ── transboundary smoke ───────────────────────────────────────────
      const southHazeWindow = SOUTH_HAZE_CODES.has(code) && month >= 8 && month <= 10
      if (((inSeason && BORDER_CODES.has(code)) || southHazeWindow)
          && pm25 !== null && pm25 >= 25) {
        let conf = 0.2
        const ev = [{
          th: southHazeWindow
            ? `จังหวัดชายแดนใต้ ช่วงหมอกควันสุมาตรา (ส.ค.–ต.ค.) + PM2.5 ${pm25} µg/m³`
            : `จังหวัดชายแดนบนเส้นทางควันข้ามแดน + ฤดูเผา + PM2.5 ${pm25} µg/m³`,
          en: southHazeWindow
            ? `Southern border province in the Sumatra-haze window (Aug–Oct) + PM2.5 ${pm25} µg/m³`
            : `Border province on a transboundary smoke corridor + burning season + PM2.5 ${pm25} µg/m³`,
        }]
        if (pm25 >= 37.5) conf += 0.15
        if (provNews === 0) {
          conf += 0.15
          ev.push({
            th: `ไม่มีข่าวการเผาในพื้นที่ (0 ชิ้นใน ${NEWS_WINDOW_DAYS} วัน) — ชี้ว่าแหล่งอาจอยู่นอกจังหวัด`,
            en: `No local burning news (0 items in ${NEWS_WINDOW_DAYS} days) — source may be outside the province`,
          })
        }
        causes.push({ id: 'transboundary', confidence: clamp01(Math.min(conf, 0.7)), evidence: ev })
      }

      // ── traffic / urban combustion ────────────────────────────────────
      if (METRO_CODES.has(code) && ratio !== null && ratio > 0.6 && pm25 !== null && pm25 >= 15) {
        let conf = 0.25
        const ev = [{
          th: `เขตเมืองหลวง + สัดส่วน PM2.5/PM10 = ${ratio} (>0.6 = ฝุ่นละเอียดจากการเผาไหม้)`,
          en: `Metro province + PM2.5/PM10 ratio ${ratio} (>0.6 = combustion-dominated fine fraction)`,
        }]
        if (no2 !== null && no2 >= 20) {
          conf += 0.15
          ev.push({
            th: `NO2 ${no2} ppb ที่สถานีในจังหวัด — ตัวชี้วัดไอเสียยานยนต์`,
            en: `NO2 at ${no2} ppb in-province — a vehicle-exhaust tracer`,
          })
        }
        if (weekday) {
          conf += 0.1
          ev.push({ th: 'วันทำงาน — ปริมาณจราจรสูง', en: 'Weekday — commute traffic volume high' })
        }
        if (pm25 >= 25) conf += 0.1
        causes.push({ id: 'traffic', confidence: clamp01(Math.min(conf, 0.75)), evidence: ev })
      }

      // ── industry / quarry (coarse mechanical dust) ────────────────────
      if (pm10 !== null && pm10 >= 80 && ratio !== null && ratio < 0.45) {
        let conf = 0.3
        const ev = [{
          th: `PM10 สูง ${pm10} µg/m³ แต่สัดส่วน PM2.5/PM10 = ${ratio} (<0.45 = ฝุ่นหยาบเชิงกล เช่น โรงโม่/ก่อสร้าง)`,
          en: `PM10 high at ${pm10} µg/m³ with PM2.5/PM10 ratio ${ratio} (<0.45 = coarse mechanical dust — quarry/construction signature)`,
        }]
        if (pm10 >= 120) conf += 0.2
        causes.push({ id: 'industry', confidence: clamp01(Math.min(conf, 0.7)), evidence: ev })
      }

      // ── advected desert dust (CAMS) ───────────────────────────────────
      const dustFc = p.dust_fc_24h ?? null
      if (dustFc !== null && dustFc >= 20) {
        let conf = 0.3
        if (dustFc >= 40) conf += 0.2
        causes.push({
          id: 'desert_dust', confidence: clamp01(Math.min(conf, 0.6)),
          evidence: [{
            th: `CAMS พยากรณ์ฝุ่นทะเลทราย ${dustFc} µg/m³ ใน 24 ชม.`,
            en: `CAMS forecasts ${dustFc} µg/m³ of desert dust within 24h`,
          }],
        })
      }

      // ── stagnation (secondary — amplifies the primary) ────────────────
      const stag = p.stagnation_comp ?? 0
      if (stag >= 60 && pm25 !== null && pm25 >= 15) {
        causes.push({
          id: 'stagnation', confidence: clamp01(0.2 + (stag - 60) / 200),
          evidence: [{
            th: `ดัชนีอากาศนิ่ง ${stag}/100 (ลม ${p.wind_fc_kmh ?? '–'} กม./ชม. โอกาสฝน ${p.precip_prob_24h ?? '–'}%) — ฝุ่นไม่ถูกระบาย`,
            en: `Stagnation index ${stag}/100 (wind ${p.wind_fc_kmh ?? '–'} km/h, rain chance ${p.precip_prob_24h ?? '–'}%) — nothing disperses the aerosol`,
          }],
        })
        // Whatever the primary source is, still air makes it worse.
        for (const c of causes) {
          if (c.id !== 'stagnation') c.confidence = clamp01(Math.min(c.confidence + 0.1, 0.95))
        }
      }

      if (causes.length === 0) continue

      causes.sort((a, b) => b.confidence - a.confidence)
      const top = causes.slice(0, 3).map((c) => ({
        id: c.id,
        label_th: CAUSE_LABELS[c.id].th,
        label_en: CAUSE_LABELS[c.id].en,
        confidence: c.confidence,
        evidence: c.evidence,
      }))
      out.set(code, {
        province_code: code,
        province_th: p.province_th,
        province_en: p.province_en,
        pm25,
        causes: top,
        primary: top[0].id,
      })
    }
    return out
  }

  return {
    all() {
      const now = Date.now()
      if (!cache || now - cacheAt > CACHE_MS) { cache = compute(); cacheAt = now }
      return cache
    },
    forProvince(code) {
      return this.all().get(String(code)) ?? null
    },
  }
}
