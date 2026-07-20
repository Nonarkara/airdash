// Science engine — research-backed health / medicine / economics / ecology /
// atmospheric metrics derived from the same live data the Air Watch Score
// uses. Every number carries a "receipt" (meta.formulas) so the UI formula
// wall can show the equation, the constants, and the citation side by side.
// Full documentation: knowledge/health-science.md.
//
// Endpoints (wired in api.js):
//   GET /api/science           → national rollup + all 77 provinces + receipts
//   GET /api/science/personal  → a personal exposure card for one profile
//
// Province PM2.5 basis: the WORST fresh (≤6h) Air4Thai ground station per
// province — exactly the basis /api/risk ranks on, so the two endpoints
// agree. Provinces without fresh ground coverage fall back to the GISTDA
// satellite+ground fusion value (≤26h; it is a modelled fusion product, so a
// longer grace is honest) — without this fallback the national mean would
// silently re-weight toward Bangkok whenever the PCD network lags.
import { num } from './util.js'
import { allProvinces, isThaiProvinceCode } from './provinces.js'
import { PROVINCE_POP, THAILAND_POP } from './populations.js'

const FRESH_PM_HOURS = 6
const FRESH_WX_HOURS = 13
const AOT40_DAYS = 7

// ─── Exposure profiles ─────────────────────────────────────────────────────
// Ventilation rates VE (m³/h) by activity, anchored to EPA Exposure Factors
// Handbook-style values, scaled per group. Guidance is ordered ASCENDING by
// maxPm25 — the first matching band wins — on the Thai AQI 2023 breakpoints
// (15 / 25 / 37.5 / 75 / 150 µg/m³).
export const PROFILES = {
  kid: {
    id: 'kid',
    label_th: 'เด็ก 6–12 ปี',
    label_en: 'Child (6–12)',
    blurb_th: 'ปอดกำลังเจริญเติบโต และหายใจเอาอากาศเข้าปอดต่อน้ำหนักตัวมากกว่าผู้ใหญ่ ~2 เท่า — ฝุ่นพิษต่อเด็กจึงมากกว่าที่เห็น',
    blurb_en: 'Developing lungs breathe roughly 2× more air per kg of body weight than adults — the same air is a bigger dose for a child',
    ventilation: { rest: 0.35, moderate: 1.0, heavy: 1.6 },
    guidance: [
      { maxPm25: 15, th: 'อากาศดีมาก — เล่นกลางแจ้งได้เต็มที่', en: 'Very good air — outdoor play unrestricted' },
      { maxPm25: 25, th: 'เล่นกลางแจ้งได้ แต่สังเกตอาการไอหรือหายใจหอบ', en: 'Outdoor play is fine — watch for coughing or wheezing' },
      { maxPm25: 37.5, th: 'ลดเวลาเล่นกลางแจ้ง เลี่ยงการวิ่งหนักต่อเนื่องนาน ๆ', en: 'Shorten outdoor play; avoid sustained hard running' },
      { maxPm25: 75, th: 'งดกิจกรรมกลางแจ้ง — ย้ายพักกลางวันและกีฬาเข้าในอาคาร', en: 'Indoor recess and indoor sports only' },
      { maxPm25: 150, th: 'อยู่ในอาคาร ปิดหน้าต่าง หากจำเป็นต้องออกไปให้สวม N95 (ขนาดเด็ก)', en: 'Stay indoors with windows closed; child-size N95 if going out is unavoidable' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคารกับเครื่องฟอกอากาศ หากไอ/หอบรุนแรงให้พบแพทย์', en: 'Hazardous — remain indoors with air filtration; seek medical care for severe cough or wheeze' },
    ],
  },
  teen: {
    id: 'teen',
    label_th: 'วัยรุ่น 13–19 ปี',
    label_en: 'Teen (13–19)',
    blurb_th: 'ปอดยังเติบโตไม่เต็มที่จนถึง ~20 ปี การสัมผัสฝุ่นสะสมในวัยนี้สัมพันธ์กับการเจริญของปอดที่ลดลงในระยะยาว',
    blurb_en: 'Lungs keep maturing until about age 20; chronic PM exposure in these years is linked to reduced lifetime lung growth',
    ventilation: { rest: 0.45, moderate: 1.5, heavy: 2.4 },
    guidance: [
      { maxPm25: 15, th: 'ออกกำลังกายกลางแจ้งได้เต็มที่', en: 'Outdoor exercise unrestricted' },
      { maxPm25: 25, th: 'ออกกำลังกายได้ตามปกติ แต่ถ้าไอหรือตาแสบให้ลดความเข้ม', en: 'Exercise as normal; ease off if you cough or your eyes sting' },
      { maxPm25: 37.5, th: 'ลดความเข้มการฝึกกลางแจ้ง งด HIIT/วิ่งระยะไกลกลางแจ้ง', en: 'Dial back outdoor intensity; skip outdoor HIIT or long runs' },
      { maxPm25: 75, th: 'ย้ายการฝึกเข้าในร่ม งดกีฬากลางแจ้งทุกชนิด', en: 'Move all training indoors; no outdoor sport' },
      { maxPm25: 150, th: 'อยู่ในอาคาร สวม N95 หากต้องเดินทาง', en: 'Stay indoors; N95 for necessary travel' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคาร งดออกกำลังกายกลางแจ้งโดยเด็ดขาด', en: 'Hazardous — indoors only; absolutely no outdoor exercise' },
    ],
  },
  adult: {
    id: 'adult',
    label_th: 'ผู้ใหญ่ทั่วไป',
    label_en: 'Adult',
    blurb_th: 'ความเสี่ยงหลักคือหัวใจและหลอดเลือด — PM2.5 ทุก +10 µg/m³ ผูกกับการเสียชีวิตทุกสาเหตุรายวันเพิ่มขึ้น ~0.7%',
    blurb_en: 'The dominant risk is cardiovascular — every +10 µg/m³ of PM2.5 tracks with ~0.7% more daily all-cause deaths',
    ventilation: { rest: 0.5, moderate: 2.0, heavy: 3.2 },
    guidance: [
      { maxPm25: 15, th: 'ทำกิจกรรมได้ตามปกติ', en: 'All activity unrestricted' },
      { maxPm25: 25, th: 'ปกติสำหรับคนทั่วไป — ผู้ที่มีโรคประจำตัวคอยสังเกตอาการ', en: 'Normal for most people; anyone with a chronic condition should note symptoms' },
      { maxPm25: 37.5, th: 'ลดกิจกรรมกลางแจ้งที่ออกแรงนาน ๆ (วิ่ง ปั่น งานกลางแดด)', en: 'Cut back on prolonged outdoor exertion (running, cycling, outdoor work)' },
      { maxPm25: 75, th: 'เลี่ยงการออกแรงกลางแจ้ง สวม N95 เมื่อต้องออกไป', en: 'Avoid outdoor exertion; wear an N95 when out' },
      { maxPm25: 150, th: 'อยู่ในอาคารให้มากที่สุด ปิดประตูหน้าต่าง', en: 'Stay indoors as much as possible, windows closed' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคาร หากแน่นหน้าอกหรือหายใจลำบากให้พบแพทย์', en: 'Hazardous — remain indoors; chest tightness or breathlessness warrants medical care' },
    ],
  },
  athlete: {
    id: 'athlete',
    label_th: 'นักกีฬา / คนออกกำลังกายหนัก',
    label_en: 'Athlete / heavy exerciser',
    blurb_th: 'การออกกำลังกายหนักดูดอากาศเข้าปอดมากกว่าตอนพักถึง 8 เท่า — ปริมาณฝุ่นที่สูดเข้าไปจึงพุ่งตาม ฝึกช่วงเช้าใกล้ถนนใหญ่ยังเจอทั้งฝุ่นและไอเสียจราจร',
    blurb_en: 'Hard exercise pulls up to 8× resting air volume — inhaled PM scales with it. Morning roadside training adds traffic exhaust on top of the haze',
    ventilation: { rest: 0.55, moderate: 2.6, heavy: 4.0 },
    guidance: [
      { maxPm25: 15, th: 'ฝึกซ้อมกลางแจ้งได้เต็มที่', en: 'Train outdoors freely' },
      { maxPm25: 25, th: 'ฝึกได้ตามปกติ — เลือกเส้นทางห่างถนนใหญ่ โดยเฉพาะช่วงเช้าที่รถติด', en: 'Train as normal — prefer routes away from major roads, especially congested mornings' },
      { maxPm25: 37.5, th: 'ย้ายการฝึกเข้าในร่ม หรือลดความเข้มเหลือ zone 1–2 เท่านั้น', en: 'Move training indoors, or cap intensity at zone 1–2' },
      { maxPm25: 75, th: 'ฝึกในร่มเท่านั้น — การฝึกหนักกลางแจ้งตอนนี้สูดฝุ่นมากกว่าคนปกติทั้งวัน', en: 'Indoor training only — hard outdoor sessions now inhale more PM than a normal person does all day' },
      { maxPm25: 150, th: 'งดฝึกกลางแจ้งทุกรูปแบบ ฝึกในร่มที่มีเครื่องฟอกอากาศ', en: 'No outdoor training of any kind; indoor sessions with air filtration' },
      { maxPm25: Infinity, th: 'อันตราย — พักหรือฝึกเบามากในร่มเท่านั้น', en: 'Hazardous — rest, or very light indoor work only' },
    ],
  },
  senior: {
    id: 'senior',
    label_th: 'ผู้สูงอายุ 65 ปีขึ้นไป',
    label_en: 'Senior (65+)',
    blurb_th: 'หัวใจและปอดตอบสนองต่อฝุ่นรุนแรงกว่า — ระวังอาการแน่นหน้าอก หายใจเหนื่อยผิดปกติ ใจสั่น หน้ามืด',
    blurb_en: 'Older hearts and lungs react more strongly — watch for chest tightness, unusual breathlessness, palpitations, dizziness',
    ventilation: { rest: 0.45, moderate: 1.4, heavy: 2.2 },
    guidance: [
      { maxPm25: 15, th: 'ทำกิจกรรมได้ตามปกติ', en: 'Normal activity is fine' },
      { maxPm25: 25, th: 'เดินออกกำลังกายเบา ๆ ได้ แต่ลดการออกแรงหนัก และสังเกตอาการแน่นหน้าอก/หอบเหนื่อย', en: 'Gentle walks are fine; ease off harder exertion and note any chest tightness or breathlessness' },
      { maxPm25: 37.5, th: 'เลี่ยงการออกแรงกลางแจ้ง พกยาประจำตัวติดตัวไว้', en: 'Avoid outdoor exertion; keep regular medication at hand' },
      { maxPm25: 75, th: 'อยู่ในอาคาร ให้คนในครอบครัวช่วยธุระนอกบ้าน', en: 'Stay indoors; let family run outdoor errands' },
      { maxPm25: 150, th: 'อยู่ในอาคาร ปิดหน้าต่าง เปิดเครื่องฟอกอากาศถ้ามี', en: 'Stay indoors, windows closed, air purifier on if available' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคาร หากแน่นหน้าอก หายใจลำบาก หรือใจสั่น ให้รีบพบแพทย์', en: 'Hazardous — remain indoors; chest pain, breathing difficulty, or palpitations need prompt medical care' },
    ],
  },
  pregnant: {
    id: 'pregnant',
    label_th: 'หญิงตั้งครรภ์',
    label_en: 'Pregnant',
    blurb_th: 'หลักฐานระบาดวิทยาพบว่า PM2.5 ทุก +10 µg/m³ ผูกกับความเสี่ยงคลอดก่อนกำหนดและทารกน้ำหนักตัวน้อยที่เพิ่มขึ้น — การสัมผัสฝุ่นของแม่คือการสัมผัสของลูก',
    blurb_en: 'Each +10 µg/m³ of PM2.5 is associated with higher preterm-birth and low-birth-weight risk — the mother\'s exposure is the baby\'s exposure',
    ventilation: { rest: 0.55, moderate: 1.8, heavy: 2.6 },
    guidance: [
      { maxPm25: 15, th: 'ทำกิจกรรมได้ตามปกติ', en: 'Normal activity is fine' },
      { maxPm25: 25, th: 'เลี่ยงการออกแรงกลางแจ้ง เดินเล่นสั้น ๆ ในที่อากาศดีได้', en: 'Avoid outdoor exertion; short walks in cleaner spots are fine' },
      { maxPm25: 37.5, th: 'อยู่ในอาคารเป็นหลัก สวม N95 ทุกครั้งที่ออกนอกบ้าน', en: 'Stay mostly indoors; N95 for every trip outside' },
      { maxPm25: 75, th: 'อยู่ในอาคาร เปิดเครื่องฟอกอากาศ เลื่อนนัด/ธุระที่ไม่จำเป็น', en: 'Stay indoors with air filtration; postpone non-essential outings' },
      { maxPm25: 150, th: 'อยู่ในอาคารโดยเคร่งครัด ปรึกษาแพทย์ผู้ดูแลหากจำเป็นต้องสัมผัสฝุ่น', en: 'Strictly indoors; consult your obstetrician if exposure is unavoidable' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคาร หากมีอาการผิดปกติให้ติดต่อแพทย์', en: 'Hazardous — remain indoors; contact your doctor about any unusual symptoms' },
    ],
  },
  asthma: {
    id: 'asthma',
    label_th: 'ผู้ป่วยหอบหืด',
    label_en: 'Asthma',
    blurb_th: 'PM2.5 กระตุ้นทางเดินหายใจอักเสบโดยตรง — พกยาพ่นระงับอาการ (reliever) ติดตัวเสมอ และทำตามแผนควบคุมหอบหืด หากหายใจลำบากรุนแรงโทร 1669',
    blurb_en: 'PM2.5 directly inflames the airways — always carry a reliever inhaler and follow your asthma action plan. For severe breathing difficulty call 1669',
    ventilation: { rest: 0.5, moderate: 1.8, heavy: 2.8 },
    guidance: [
      { maxPm25: 15, th: 'ใช้ชีวิตปกติ พกยาพ่นระงับอาการติดตัวเสมอ', en: 'Normal activity — always carry your reliever inhaler' },
      { maxPm25: 25, th: 'ออกกำลังกายในร่มดีกว่า พ่นยาเตรียมตามแผนก่อนออกกำลังกายถ้าแพทย์สั่ง', en: 'Prefer indoor exercise; pre-medicate before activity if your action plan says so' },
      { maxPm25: 37.5, th: 'อยู่ในอาคาร ใช้ยาคุม (preventer) ตามแผนอย่างเคร่งครัด', en: 'Stay indoors; take preventer medication exactly as prescribed' },
      { maxPm25: 75, th: 'อยู่ในอาคาร ติดตามอาการ (หรือ peak flow ถ้ามี) ใกล้ชิด', en: 'Stay indoors; monitor symptoms (or peak flow) closely' },
      { maxPm25: 150, th: 'อยู่ในอาคารโดยเคร่งครัด ทำตามแผนฉุกเฉิน หากอาการกำเริบหนักโทร 1669', en: 'Strictly indoors; follow your emergency plan — call 1669 for a severe attack' },
      { maxPm25: Infinity, th: 'อันตราย — อยู่ในอาคาร หากหายใจลำบาก ยาพ่นไม่ได้ผล โทร 1669 ทันที', en: 'Hazardous — remain indoors; if breathing is hard and the reliever is not helping, call 1669 immediately' },
    ],
  },
}

const ACTIVITIES = ['rest', 'moderate', 'heavy']

// ─── Small math helpers ────────────────────────────────────────────────────
const r1 = (x) => (x === null || !Number.isFinite(x)) ? null : Math.round(x * 10) / 10
const r2 = (x) => (x === null || !Number.isFinite(x)) ? null : Math.round(x * 100) / 100
const clampNum = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

/** Thai AQI 2023 band key for a PM2.5 value (15/25/37.5/75/150 breakpoints). */
export function pm25Band(pm) {
  if (pm === null || !Number.isFinite(pm)) return null
  if (pm <= 15) return 'very_good'
  if (pm <= 25) return 'good'
  if (pm <= 37.5) return 'moderate'
  if (pm <= 75) return 'unhealthy'
  if (pm <= 150) return 'very_unhealthy'
  return 'hazardous'
}

/** Dose-equivalence outdoor budget: same inhaled dose as 60 min at the WHO
 *  24h guideline (15 µg/m³). At/below the guideline the budget is unlimited. */
function playBudget(pm, S) {
  if (pm === null || !Number.isFinite(pm)) return { min: null, unlimited: false }
  if (pm <= S.who24hPm25) return { min: S.playBudget.maxMin, unlimited: true }
  return {
    min: Math.round(clampNum(S.playBudget.baseMin * S.who24hPm25 / pm, S.playBudget.minMin, S.playBudget.maxMin)),
    unlimited: false,
  }
}

/** Koschmieder visibility with Seinfeld & Pandis hygroscopic growth. */
function visibilityKm(pm, rhPct, S) {
  if (pm === null || !Number.isFinite(pm)) return null
  const rh = clampNum((rhPct ?? S.defaultRh * 100) / 100, 0, 1)
  const fRh = Math.min(1 / Math.pow(1 - rh, 0.7), 6)
  const bExt = S.extinctionPerUg * pm * fRh // Mm⁻¹
  return clampNum(S.visibilityK / bExt, 0.5, 350)
}

export function createScience({ db, CONFIG }) {
  const S = CONFIG.science
  const BETA = Math.log(S.rrPer10ug) / 10 // ≈ 6.78e-4 per µg/m³
  let cache = null
  let cacheAt = 0

  /** Liu et al. 2019 concentration–response above the WHO 24h counterfactual. */
  function excessMortalityPct(pm) {
    if (pm === null || !Number.isFinite(pm)) return null
    const rr = Math.exp(BETA * Math.max(0, pm - S.who24hPm25))
    return (rr - 1) * 100
  }

  function aqliYearsLost(pmProxy) {
    if (pmProxy === null || !Number.isFinite(pmProxy)) return null
    return Math.max(0, pmProxy - S.whoAnnualPm25) * S.aqliYearsPerUg
  }

  function freshRows(source, metrics, cutoff) {
    const placeholders = metrics.map(() => '?').join(',')
    return db.all(
      `SELECT l.station_key, l.metric, l.value, l.obs_time,
              s.province_code, s.province_th, s.province_en
       FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = ? AND l.metric IN (${placeholders}) AND l.obs_time >= ?`,
      source, ...metrics, cutoff,
    )
  }

  /**
   * Ozone crop stress, AOT40-style, per province over the last 7 days:
   * for each station, sum max(0, o3_ppb − 40) over daylight hours
   * (07:00–18:59 local — obs_time strings are already Bangkok local), then
   * total the week. Province value = its WORST station (consistent with the
   * worst-station philosophy everywhere else in AirDash — crop damage
   * happens where the ozone is, not at the provincial mean). Provinces with
   * no o3 monitors (most of the country) come back null, not zero.
   */
  function aot40ByProvince() {
    const rows = db.all(
      `SELECT s.province_code, r.station_key, r.obs_time, r.value
       FROM readings r
       JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.source = 'air4thai' AND r.metric = 'o3' AND r.obs_time >= ?
         AND s.province_code IS NOT NULL`,
      localCutoff(AOT40_DAYS * 24),
    )
    const byProvStation = new Map() // code -> Map(station -> sum)
    for (const row of rows) {
      if (!isThaiProvinceCode(row.province_code)) continue
      const hour = Number(String(row.obs_time).slice(11, 13))
      if (!Number.isFinite(hour) || hour < 7 || hour > 18) continue // daylight 07:00–18:59
      const v = num(row.value)
      if (v === null) continue
      let stations = byProvStation.get(row.province_code)
      if (!stations) byProvStation.set(row.province_code, stations = new Map())
      stations.set(row.station_key, (stations.get(row.station_key) ?? 0) + Math.max(0, v - 40))
    }
    const out = new Map()
    for (const [code, stations] of byProvStation) {
      out.set(code, Math.max(0, ...stations.values()))
    }
    return out
  }

  function aot40Band(aot40) {
    if (aot40 === null || !Number.isFinite(aot40)) return null
    if (aot40 < S.aot40Bands.moderate) return 'low'
    if (aot40 < S.aot40Bands.elevated) return 'moderate'
    return 'elevated'
  }

  function compute() {
    const pmRows = freshRows('air4thai', ['pm25'], localCutoff(FRESH_PM_HOURS))
    const gistRows = freshRows('gistda_pm25', ['pm25', 'pm25_avg24h'], localCutoff(S.gistdaFreshHours))
    const rhRows = freshRows('openmeteo', ['rh_pct'], localCutoff(FRESH_WX_HOURS))
    const aot40 = aot40ByProvince()

    // Worst fresh ground station per province (the /api/risk basis).
    const ground = new Map()
    for (const row of pmRows) {
      if (!isThaiProvinceCode(row.province_code)) continue
      const v = num(row.value)
      if (v === null) continue
      const cur = ground.get(row.province_code)
      if (cur === undefined || v > cur) ground.set(row.province_code, v)
    }
    // GISTDA fusion per province (station_key is 'pv_<code>').
    const gist = new Map()
    for (const row of gistRows) {
      const code = String(row.station_key).replace(/^pv_/, '')
      if (!isThaiProvinceCode(code)) continue
      const v = num(row.value)
      if (v === null) continue
      let g = gist.get(code)
      if (!g) gist.set(code, g = { pm25: null, avg24h: null, obs_time: row.obs_time })
      if (row.metric === 'pm25') g.pm25 = v
      else if (row.metric === 'pm25_avg24h') g.avg24h = v
      if (row.obs_time > g.obs_time) g.obs_time = row.obs_time
    }
    const rhByProv = new Map()
    for (const row of rhRows) {
      const v = num(row.value)
      if (v !== null) rhByProv.set(String(row.station_key), v)
    }

    // Assemble all 77 registry provinces — every province appears in the
    // response even when it has no fresh data (nulls, not omissions).
    const provinces = allProvinces().map((reg) => {
      const code = reg.province_code
      const population = PROVINCE_POP[code] ?? null
      const g = gist.get(code)
      const pm25 = ground.get(code) ?? g?.pm25 ?? null
      // AQLI proxy: GISTDA's actual 24h average when available — life-
      // expectancy math is about sustained exposure, not the current spike —
      // else the current value. Labelled in the receipts.
      const aqliProxy = g?.avg24h ?? pm25
      const cigs = pm25 !== null ? pm25 / S.cigUgPerDay : null
      const budget = playBudget(pm25, S)
      return {
        code,
        name_th: reg.province_th,
        name_en: reg.province_en,
        population,
        pm25: r1(pm25),
        pm25_source: ground.has(code) ? 'air4thai' : (g ? 'gistda' : null),
        pm25_avg24h: r1(g?.avg24h ?? null),
        band: pm25Band(pm25),
        cigs_per_day: r2(cigs),
        life_minutes_per_day: r1(cigs !== null ? cigs * S.minutesPerCig : null),
        excess_mortality_pct: r2(excessMortalityPct(pm25)),
        aqli_years_lost: r2(aqliYearsLost(aqliProxy)),
        visibility_km: r1(visibilityKm(pm25, rhByProv.get(code) ?? null, S)),
        play_budget_min: budget.min,
        play_unlimited: budget.unlimited,
        o3_aot40_week: aot40.has(code) ? Math.round(aot40.get(code)) : null,
      }
    }).sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))

    // ── National rollup: population-weighted over provinces WITH data ──
    const withPm = provinces.filter((p) => p.pm25 !== null && p.population)
    const coveredPop = withPm.reduce((a, p) => a + p.population, 0)
    const natPm = coveredPop > 0
      ? withPm.reduce((a, p) => a + p.pm25 * p.population, 0) / coveredPop
      : null
    const weightedAvg = (field) => {
      const rows = provinces.filter((p) => p[field] !== null && p.population)
      const pop = rows.reduce((a, p) => a + p.population, 0)
      return pop > 0 ? rows.reduce((a, p) => a + p[field] * p.population, 0) / pop : null
    }

    // Attributable-fraction economics on the national mean.
    // RR and AF at the population-weighted mean PM2.5; deaths scale with the
    // FULL national registered population (the mean is already pop-weighted,
    // so covered/uncovered provinces contribute proportionally).
    const rr = natPm !== null ? Math.exp(BETA * Math.max(0, natPm - S.who24hPm25)) : null
    const af = rr !== null ? (rr - 1) / rr : null
    const deathsPerDay = af !== null ? THAILAND_POP * S.thaiDailyMortalityRate * af : null
    const dailyCostThb = deathsPerDay !== null ? deathsPerDay * S.vslThb * S.morbidityMultiplier : null

    const natAot40 = weightedAvg('o3_aot40_week')
    const natCigs = natPm !== null ? natPm / S.cigUgPerDay : null

    const national = {
      pm25: r1(natPm),
      population: THAILAND_POP,
      population_covered: coveredPop,
      band: pm25Band(natPm),
      cigs_per_day: r2(natCigs),
      life_minutes_per_day: r1(natCigs !== null ? natCigs * S.minutesPerCig : null),
      excess_mortality_pct: r2(excessMortalityPct(natPm)),
      aqli_years_lost: r2(weightedAvg('aqli_years_lost')),
      attributable_deaths_per_day: r2(deathsPerDay),
      daily_cost_million_thb: dailyCostThb !== null ? Math.round(dailyCostThb / 1e6 * 10) / 10 : null,
      haze_tax_thb_per_person: r2(dailyCostThb !== null ? dailyCostThb / THAILAND_POP : null),
      visibility_km: r1(weightedAvg('visibility_km')),
      air_breathed_m3_per_day: S.airBreathedM3PerDay,
      o3_crop_stress: {
        aot40_week_ppbh: natAot40 !== null ? Math.round(natAot40) : null,
        band: aot40Band(natAot40),
      },
    }

    return {
      generated_at: new Date().toISOString(),
      national,
      provinces,
      profiles: PROFILES,
      meta: {
        notes_th: 'ตัวเลขเชิงประมาณการเพื่อการสื่อสารความเสี่ยง ไม่ใช่การวินิจฉัยทางการแพทย์ — ทุกสูตรเปิดเผยค่าคงที่และที่มา',
        notes_en: 'Risk-communication estimates, not medical advice — every formula ships with its constants and citation',
        formulas: receipts(S, BETA),
      },
    }
  }

  /** "Science receipts" — one entry per formula, with constants + citation. */
  function receipts(cfg, beta) {
    return [
      {
        id: 'cigarette_equivalence',
        title_th: 'เทียบบุหรี่',
        title_en: 'Cigarette equivalence',
        formula: 'cigs_per_day = PM2.5 / 22',
        constants: { cigUgPerDay: cfg.cigUgPerDay },
        source: 'Müller & Müller (2014), Berkeley Earth rule of thumb: one day at 22 µg/m³ PM2.5 ≈ smoking 1 cigarette',
      },
      {
        id: 'life_minutes',
        title_th: 'นาทีชีวิตที่สูญเสีย',
        title_en: 'Life-minutes lost',
        formula: 'life_minutes_per_day = cigs_per_day × 11',
        constants: { minutesPerCig: cfg.minutesPerCig },
        source: 'Spiegelhalter (2012, BMJ) microlives: one cigarette ≈ 11 minutes of life',
      },
      {
        id: 'excess_mortality',
        title_th: 'ความเสี่ยงเสียชีวิตรายวันส่วนเกิน',
        title_en: 'Excess daily mortality risk',
        formula: 'RR = exp(β × max(0, PM2.5 − 15)); excess_pct = (RR − 1) × 100',
        constants: { beta_per_ug: +beta.toExponential(3), rr_per_10ug: cfg.rrPer10ug, counterfactual_who24h: cfg.who24hPm25 },
        source: 'Liu et al. (2019, NEJM, 652 cities): +0.68% all-cause daily mortality per +10 µg/m³; counterfactual = WHO 2021 24h guideline (15 µg/m³). Long-term CRFs (Burnett et al. 2018 GEMM) are steeper — this is the conservative short-term estimate',
      },
      {
        id: 'attributable_deaths_cost',
        title_th: 'ผู้เสียชีวิตและต้นทุนทางเศรษฐกิจ',
        title_en: 'Attributable deaths & daily cost',
        formula: 'AF = (RR−1)/RR; deaths/day = population × 1.97e−5 × AF; cost = deaths × VSL × 1.2; haze_tax = cost / population',
        constants: {
          thaiDailyMortalityRate: cfg.thaiDailyMortalityRate,
          vsl_thb: cfg.vslThb, vsl_range_thb: [3e6, 3e7],
          morbidityMultiplier: cfg.morbidityMultiplier,
        },
        source: 'Attributable-fraction method (WHO); Thai crude mortality ≈7.2/1000/yr; VSL 15M THB is a conservative Thai estimate (literature spans ~3–30M THB); ×1.2 adds morbidity on top of mortality',
      },
      {
        id: 'aqli',
        title_th: 'อายุขัยที่สูญเสีย (AQLI)',
        title_en: 'Life expectancy lost (AQLI)',
        formula: 'years_lost = max(0, PM2.5_proxy − 5) × 0.098',
        constants: { yearsPerUg: cfg.aqliYearsPerUg, counterfactual_who_annual: cfg.whoAnnualPm25, proxy: 'GISTDA pm25_avg24h when fresh, else current PM2.5' },
        source: 'Air Quality Life Index (EPIC, U. Chicago): sustained +10 µg/m³ PM2.5 ≈ −0.98 yr life expectancy; counterfactual = WHO 2021 annual guideline (5 µg/m³). Proxy is the 24h average because AQLI is about sustained exposure, not the current spike',
      },
      {
        id: 'inhaled_dose',
        title_th: 'ปริมาณฝุ่นที่สูดเข้าปอด',
        title_en: 'Inhaled dose',
        formula: 'dose_µg = PM2.5 × VE(m³/h) × hours',
        constants: { ventilation_table: 'per profile × activity, m³/h (kid rest 0.35 … athlete heavy 4.0)' },
        source: 'EPA Exposure Factors Handbook ventilation rates, scaled per profile; 100% retention assumption (upper-bound dose — real deposition is lower)',
      },
      {
        id: 'play_budget',
        title_th: 'งบเวลาเล่น/ออกกำลังกายกลางแจ้ง',
        title_en: 'Outdoor play/exercise budget',
        formula: 'budget_min = clamp(60 × 15 / PM2.5, 5, 480); unlimited when PM2.5 ≤ 15',
        constants: { baseMin: cfg.playBudget.baseMin, minMin: cfg.playBudget.minMin, maxMin: cfg.playBudget.maxMin, reference: cfg.who24hPm25 },
        source: 'Dose-equivalence: the budget holds the inhaled dose equal to 60 minutes at the WHO 2021 24h guideline (15 µg/m³)',
      },
      {
        id: 'visibility',
        title_th: 'ทัศนวิสัยโดยประมาณ',
        title_en: 'Estimated visibility',
        formula: 'f(RH) = min(1/(1−RH)^0.7, 6); b_ext = 3.0 × PM2.5 × f(RH) Mm⁻¹; visibility_km = clamp(3912 / b_ext, 0.5, 350)',
        constants: { koschmieder_K: cfg.visibilityK, extinctionPerUg: cfg.extinctionPerUg, defaultRh: cfg.defaultRh },
        source: 'Koschmieder (1924) contrast threshold; hygroscopic growth factor per Seinfeld & Pandis (2006). Approximation — haze composition varies',
      },
      {
        id: 'aot40_crop_stress',
        title_th: 'ความเครียดของพืชจากโอโซน (AOT40)',
        title_en: 'Ozone crop stress (AOT40-style)',
        formula: 'AOT40_week = Σ_day Σ_07:00–18:59 max(0, O3_ppb − 40); province = worst station; national = population-weighted mean',
        constants: { threshold_ppb: 40, window: 'daylight 07:00–18:59 local, 7 days', bands: { low: '<210', moderate: '210–700', elevated: '>700 ppb·h/week' } },
        source: 'WHO/UNECE CLRTAP AOT40 critical-level method (3-month growing-season critical level 3000 ppb·h ≈ ~230 ppb·h/week average), rescaled to a rolling 7-day window. Provinces without O3 monitors report null',
      },
      {
        id: 'air_breathed',
        title_th: 'ปริมาณอากาศที่หายใจต่อวัน',
        title_en: 'Air breathed per day',
        formula: 'constant: 11 m³/day (adult reference; child ≈ 8)',
        constants: { adult_m3_per_day: cfg.airBreathedM3PerDay, child_m3_per_day: 8 },
        source: 'Standard adult reference ventilation (~11 m³/day) used in exposure science',
      },
    ]
  }

  /** The cached national payload (60s TTL, same pattern as the other engines). */
  function get() {
    const now = Date.now()
    if (!cache || now - cacheAt > S.cacheMs) {
      cache = compute()
      cacheAt = now
    }
    return cache
  }

  /**
   * Personal exposure card. PM2.5 resolution order: explicit `pm25` param
   * wins; else the named province's current value; else the national mean.
   */
  function personal({ pm25: pmParam, province: code, profile: profileId, outdoorMin, activity }) {
    const profile = PROFILES[profileId] ?? PROFILES.adult
    const act = ACTIVITIES.includes(activity) ? activity : 'rest'
    const minutes = Number.isFinite(outdoorMin) ? clampNum(outdoorMin, 0, 1440) : 60

    const snap = get()
    const explicitPm = Number.isFinite(pmParam) && pmParam >= 0 && pmParam <= 1000 ? pmParam : null
    const provRow = code ? snap.provinces.find((p) => p.code === String(code)) ?? null : null
    let pm25 = explicitPm
    let source = 'param'
    if (pm25 === null && provRow?.pm25 !== null && provRow?.pm25 !== undefined) {
      pm25 = provRow.pm25
      source = 'province'
    }
    if (pm25 === null) {
      pm25 = snap.national.pm25
      source = 'national'
    }

    const ve = profile.ventilation[act]
    const doseUg = pm25 !== null ? pm25 * ve * (minutes / 60) : null
    const cigs = pm25 !== null ? (pm25 / S.cigUgPerDay) * (minutes / 1440) : null
    const budget = playBudget(pm25, S)
    const band = pm25Band(pm25)
    const guidance = pm25 !== null
      ? profile.guidance.find((g) => pm25 <= g.maxPm25) ?? profile.guidance.at(-1)
      : null

    return {
      generated_at: new Date().toISOString(),
      resolved: {
        pm25: r1(pm25),
        source,
        province: provRow && { code: provRow.code, name_th: provRow.name_th, name_en: provRow.name_en, pm25: provRow.pm25, band: provRow.band },
      },
      profile: { id: profile.id, label_th: profile.label_th, label_en: profile.label_en, blurb_th: profile.blurb_th, blurb_en: profile.blurb_en },
      activity: act,
      outdoor_min: Math.round(minutes),
      ventilation_m3h: ve,
      dose_ug: r1(doseUg),
      cigs_equiv: r2(cigs),
      life_minutes: r1(cigs !== null ? cigs * S.minutesPerCig : null),
      play_budget_min: budget.min,
      play_unlimited: budget.unlimited,
      band,
      guidance: guidance && { th: guidance.th, en: guidance.en },
    }
  }

  return { get, personal, invalidate() { cache = null } }
}
