// AirDash configuration — every tunable in one place.
import { fileURLToPath } from 'node:url'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const root = fileURLToPath(new URL('..', import.meta.url))

export const CONFIG = {
  host: '0.0.0.0', // reachable from phones on the LAN
  port: Number(process.env.PORT) || 8341,

  root,
  dbPath: process.env.AIRDASH_DB_PATH || `${root}data/airdash.db`,
  publicDir: `${root}public`,
  knowledgeDir: `${root}knowledge`,
  logDir: `${root}logs`,

  fetchTimeoutMs: 15_000,
  tapRingSize: 1000,
  sseHeartbeatMs: 25_000,
  maxSseClients: 500, // backstop against fd exhaustion from a runaway/abusive client

  // Poll cadences follow each upstream's native update rhythm.
  intervals: {
    air4thai: 1 * HOUR,      // PCD publishes hourly
    // Open-Meteo free tier has a daily request limit (10,000/day globally,
    // but smaller per-IP burst limits bite first). 6h = 4 calls/day per
    // source × 3 sources = 12 calls/day, well under any sensible limit,
    // and the forecast only changes meaningfully every few hours anyway.
    // The previous 3h setting hit 429s on Aug 28 because the scheduler's
    // exponential backoff wasn't long enough to ride out a "daily quota
    // exhausted" error (max 6× = 18h, but the limit doesn't reset for
    // 24h). The 429-aware park in scheduler.js handles the recovery
    // edge; the lower cadence prevents the trigger in the first place.
    openmeteo: 6 * HOUR,     // weather forecast (rain probability, wind, temp, RH)
    openmeteo_aq: 6 * HOUR,  // CAMS air-quality forecast (12-hourly cycles upstream)
    thaiwater_rain: 10 * MINUTE,
    enso: 12 * HOUR,         // ONI revises monthly; cheap to recheck
    news: 30 * MINUTE,
    imerg: 30 * MINUTE,      // IMERG Early publishes half-hourly (~4h latency)
    gistda_pm25: 1 * HOUR,   // GISTDA satellite+ground PM2.5 fusion
    pcd_noise: 30 * MINUTE,   // PCD noisemonitor.net — daily Leq, polled sub-hourly
  },

  // Thai AQI 2023 PM2.5 breakpoints (µg/m³): ≤15 very good, ≤25 good,
  // ≤37.5 moderate, ≤75 unhealthy-start, >75 unhealthy.
  thresholds: {
    pm25Moderate: 25,
    pm25Unhealthy: 37.5,
    pm25VeryUnhealthy: 75,
    pm25Hazardous: 150,
    aqiUnhealthy: 100,       // Air4Thai composite AQI
    rainWashout24h: 5,       // mm/24h at which washout becomes meaningful
    // TMD 24h rainfall categories (กรมอุตุนิยมวิทยา): ฝนหนัก heavy 35–90 mm,
    // ฝนหนักมาก very heavy >90 mm. "notable" is AirDash's own bar for a gauge
    // worth a datum event on the tap — well below heavy, but unusual in the
    // dry season and the level where washout is clearly underway.
    rainNotable24h: 10,
    rainHeavy24h: 35,
    rainVeryHeavy24h: 90,
    alertCooldownMs: 6 * HOUR,
  },

  // Physical bounds for each metric — readings outside [min, max] are
  // treated as sensor errors and dropped to null, NOT pushed through
  // (which would skew the watch score, fire false alerts, and break
  // the "no mock data — every number is real" promise). The maxes are
  // set comfortably above the worst real-world observation we know of
  // (Hanoi 2019 PM2.5 ≈ 900 µg/m³, Delhi Diwali PM2.5 ≈ 1000 µg/m³,
  //  PCD/Air4Thai Hazardous AQI = 500, PCD noise sensor ceiling = 140 dB),
  // so anything past the bound is a sensor reading NaN/garbage, not a
  // measurement. Each rejected value is logged once per ingest so the
  // operator can see whether a particular station is reporting bad data
  // — a 1-in-1000 outlier is a curiosity, ten of them from one station
  // is a hardware problem that should be reported to PCD.
  validityBounds: {
    pm25:        { min:   0, max:  1200 },   // µg/m³ (Hanoi worst)
    pm10:        { min:   0, max:  3000 },   // µg/m³
    o3:          { min:   0, max:  1000 },   // ppb
    no2:         { min:   0, max:  2000 },   // ppb
    so2:         { min:   0, max:  2000 },   // ppb
    co:          { min:   0, max:   100 },   // ppm
    aqi:         { min:   0, max:   500 },   // Air4Thai composite cap
    noise_leq:   { min:  20, max:   140 },   // dB(A) (sensor ceiling)
    noise_max:   { min:  20, max:   145 },   // dB(A)
    rain_1h:     { min:   0, max:   500 },   // mm
    rain_24h:    { min:   0, max:  1500 },   // mm
    temperature: { min: -50, max:    60 },   // °C
    humidity:    { min:   0, max:   100 },   // %
    wind_speed:  { min:   0, max:   200 },   // km/h
    wind_gust:   { min:   0, max:   300 },   // km/h
    pressure:    { min: 870, max:  1080 },   // hPa
  },

  retention: {
    rawDays: 90,       // raw readings older than this roll up into readings_hourly
    runAtHour: 3,      // local time, quiet hours
  },

  risk: {
    cacheMs: MINUTE,
    weights: { pm25: 0.40, pollutants: 0.10, trend: 0.15, forecast: 0.20, stagnation: 0.15 },
    bands: { watch: 20, elevated: 45, high: 70 }, // score >= band
    trendGapMs: 30 * MINUTE, // min age of a stored snapshot before it's refreshed
  },

  // Danger Score — separate composite, narrower scope than the Air Watch
  // Score. Capped bands so the verb is always interpretable: 0–19 safe,
  // 20–44 cautious, 45–69 dangerous, 70+ very dangerous. See danger.js.
  danger: {
    bands: { watch: 20, elevated: 45, high: 70 },
  },

  // Science engine — health/medicine/economics/ecology/atmospheric metrics.
  // Every constant here is cited in knowledge/health-science.md and surfaced
  // to the UI via /api/science meta.formulas ("science receipts").
  science: {
    cacheMs: MINUTE,
    cigUgPerDay: 22,            // 1 cigarette ≈ one day at 22 µg/m³ PM2.5 (Müller & Müller 2014 / Berkeley Earth)
    minutesPerCig: 11,          // ~11 min of life per cigarette (Spiegelhalter 2012 microlives)
    rrPer10ug: 1.0068,          // +0.68% all-cause daily mortality per +10 µg/m³ (Liu et al. 2019, NEJM, 652 cities)
    who24hPm25: 15,             // WHO 2021 AQG 24h PM2.5 guideline (counterfactual for excess risk)
    whoAnnualPm25: 5,           // WHO 2021 AQG annual PM2.5 guideline (AQLI counterfactual)
    aqliYearsPerUg: 0.098,      // AQLI/EPIC: sustained +10 µg/m³ ≈ −0.98 yr life expectancy
    thaiDailyMortalityRate: 1.97e-5, // Thai crude mortality ≈ 7.2/1000/yr ÷ 365
    vslThb: 15_000_000,         // conservative Thai VSL (literature range ~3–30M THB)
    morbidityMultiplier: 1.2,   // morbidity adds ~20% on top of mortality cost
    airBreathedM3PerDay: 11,    // adult reference ventilation (kid ~8)
    defaultRh: 0.65,            // fallback RH fraction for the visibility estimate
    visibilityK: 3912,          // Koschmieder constant (km·Mm⁻¹)
    extinctionPerUg: 3.0,       // Mm⁻¹ dry extinction per µg/m³ PM2.5
    aot40Bands: { moderate: 210, elevated: 700 }, // ppb·h per 7 days (WHO/CLRTAP-scaled)
    playBudget: { baseMin: 60, minMin: 5, maxMin: 480 }, // dose-equivalence at WHO 24h guideline
    gistdaFreshHours: 26,       // GISTDA fusion is hourly but can lag; allow a day before gap-filling fails
  },

  // Dust/burning season window (northern haze peaks Feb–Apr).
  dustSeason: {
    startMonth: 12, startDay: 1,   // 1 Dec
    endMonth: 4, endDay: 30,       // 30 Apr
    dustLoadPctTrigger: 30,        // % provinces with PM2.5 ≥ 25 µg/m³
  },

  sensorHealth: {
    flatlineSamples: 6,        // consecutive identical readings that count as stuck
    rainWithoutDropUg: 10,     // 6-hour rain (mm) that should normally wash PM down
    spikeUg6h: 60,             // PM2.5 jump in 6 h considered a suspicious spike
  },

  // LINE Notify was terminated by LINE on 2025-03-31 (EOL — see
  // https://notify-bot.line.me/closing-announce). The per-token push path
  // (server/linePush.js) targets a defunct API, so the 5-min tick is gated
  // off here. The module is kept for history; flip back on only if a
  // successor channel is wired in. The LINE OA broadcast path
  // (server/line.js, @630xxaki) is unaffected and remains the primary
  // LINE channel.
  lineNotifyEnabled: false,

  // Cloud LLM via NVIDIA NIM (free tier, OpenAI-compatible API). The API key
  // is NOT stored here (this file is committed) — it's read at runtime from
  // the NVIDIA_NIM_KEY env var, or the DB kv table ('nim_api_key', set via
  // `node scripts/set-llm-key.mjs <key>`).
  llm: {
    base: process.env.NIM_BASE || 'https://integrate.api.nvidia.com/v1',
    chatModel: process.env.NIM_CHAT_MODEL || 'qwen/qwen3-next-80b-a3b-instruct',
    embedModel: process.env.NIM_EMBED_MODEL || 'nvidia/llama-nemotron-embed-1b-v2',
    probeTtlMs: 5 * MINUTE,
    temperature: 0.2,
    maxTokens: 400,
  },
}
