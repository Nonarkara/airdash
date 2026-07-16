// FloodDash configuration — every tunable in one place.
import { fileURLToPath } from 'node:url'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const root = fileURLToPath(new URL('..', import.meta.url))

export const CONFIG = {
  host: '0.0.0.0', // reachable from phones on the LAN
  port: Number(process.env.PORT) || 8340,

  root,
  dbPath: process.env.FLOODDASH_DB_PATH || `${root}data/flooddash.db`,
  publicDir: `${root}public`,
  knowledgeDir: `${root}knowledge`,
  logDir: `${root}logs`,

  fetchTimeoutMs: 15_000,
  tapRingSize: 1000,
  sseHeartbeatMs: 25_000,
  maxSseClients: 500, // backstop against fd exhaustion from a runaway/abusive client

  // Poll cadences follow each upstream's native update rhythm.
  intervals: {
    thaiwater_wl: 10 * MINUTE,
    thaiwater_rain: 10 * MINUTE,
    thaiwater_dam: 1 * HOUR,
    rid_reservoir: 6 * HOUR,
    air4thai: 1 * HOUR,
    openmeteo: 3 * HOUR,
    glofas: 3 * HOUR,     // GloFAS updates 4×/day
    enso: 12 * HOUR,      // ONI revises monthly; cheap to recheck
    news: 30 * MINUTE,
    imerg: 30 * MINUTE,   // IMERG Early publishes half-hourly (~4h latency)
  },

  // TMD 24-h rain bands: light 0.1–10, moderate 10.1–35, heavy 35.1–90, very heavy >90 mm.
  thresholds: {
    rainHeavy24h: 35,
    rainVeryHeavy24h: 90,
    rainCritical24h: 135,
    rainFlash1h: 30,
    alertSituationLevel: 4,
    damFullPct: 100,
    reservoirFullPct: 95,
    alertCooldownMs: 6 * HOUR,
  },

  retention: {
    rawDays: 90,       // raw readings older than this roll up into readings_hourly
    runAtHour: 3,      // local time, quiet hours
  },

  risk: {
    cacheMs: MINUTE,
    weights: { water: 0.40, rain: 0.25, forecast: 0.15, wetness: 0.10, riseRate: 0.10 },
    bands: { watch: 20, elevated: 45, high: 70 }, // score >= band
    trendGapMs: 30 * MINUTE, // min age of a stored snapshot before it's refreshed
  },

  sensorHealth: {
    flatlineSamples: 6,        // how many consecutive identical readings count as stuck
    rainWithoutRiseMm: 20,     // 6-hour rain total that should normally move water
    riseWithoutRainMm: 5,      // 6-hour rain total below which a fast rise is suspicious
    minRiseM: 0.3,             // metres in 6 h considered "fast"
  },

  // Cloud LLM via NVIDIA NIM (free tier, OpenAI-compatible API). Replaced the
  // local Ollama setup, which never ran reliably on this machine. The API key
  // is NOT stored here (this file is committed) — it's read at runtime from
  // the NVIDIA_NIM_KEY env var, or the DB kv table ('nim_api_key', set via
  // `node scripts/set-llm-key.mjs <key>`).
  llm: {
    base: process.env.NIM_BASE || 'https://integrate.api.nvidia.com/v1',
    // Measured 2026-07-13 on the free serverless tier: the big dense models
    // (llama-3.3-70b, gemma-4-31b) queue-stall — >60s with no response
    // headers. qwen3-next 80B-A3B (MoE, ~3B active) answered in 611ms with
    // solid Thai. baai/bge-m3 returned HTTP 500 on every request shape;
    // nemotron-embed-1b-v2 is NVIDIA's multilingual retriever and works.
    chatModel: process.env.NIM_CHAT_MODEL || 'qwen/qwen3-next-80b-a3b-instruct',
    embedModel: process.env.NIM_EMBED_MODEL || 'nvidia/llama-nemotron-embed-1b-v2',
    probeTtlMs: 5 * MINUTE,
    temperature: 0.2,
    maxTokens: 400,
  },
}
