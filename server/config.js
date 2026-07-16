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
    openmeteo: 3 * HOUR,     // weather forecast (rain probability, wind)
    openmeteo_aq: 3 * HOUR,  // CAMS air-quality forecast (12-hourly cycles upstream)
    thaiwater_rain: 10 * MINUTE,
    enso: 12 * HOUR,         // ONI revises monthly; cheap to recheck
    news: 30 * MINUTE,
    imerg: 30 * MINUTE,      // IMERG Early publishes half-hourly (~4h latency)
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
    alertCooldownMs: 6 * HOUR,
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
