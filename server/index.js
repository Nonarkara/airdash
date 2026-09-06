// AirDash — 24/7 air-quality monitoring for Thailand.
// Single process: ingest scheduler + SQLite collection + HTTP/SSE dashboard + cloud-LLM chat.
import { CONFIG } from './config.js'
import { log, setQuotaStore } from './util.js'
import { openDb } from './db.js'
import { createBus } from './bus.js'
import { createAlerts } from './alerts.js'
import { createScheduler } from './scheduler.js'
import { createRisk } from './risk.js'
import { createWashout } from './washout.js'
import { createDanger } from './danger.js'
import { createHarm } from './harm.js'
import { createScience } from './science.js'
import { createCauses } from './causes.js'
import { createPatterns } from './patterns.js'
import { createRag } from './rag.js'
import { createFaq } from './faq.js'
import { indexKnowledge } from './knowledge.js'
import { ingestLibrary } from './library.js'
import { scheduleRetention } from './retention.js'
import { startHttp } from './http.js'
import { buildRoutes } from './api.js'

import air4thai from './sources/air4thai.js'
import openmeteo from './sources/openmeteo.js'
import openmeteoAq from './sources/openmeteo-aq.js'
import thaiwaterRain from './sources/thaiwater-rain.js'
import enso from './sources/enso.js'
import news from './sources/news.js'
import imerg from './sources/imerg.js'
import gistdaPm25 from './sources/gistda-pm25.js'
import pcdNoise from './sources/pcd-noise.js'
import aqHistory from './sources/aq-history.js'
import { createLine } from './line.js'
import { createTelegram } from './telegram.js'
import { createTelegramBroadcaster } from './telegramPush.js'

const startedAt = Date.now()
log('info', 'airdash starting', { node: process.version, pid: process.pid })

const db = openDb()
const bus = createBus(db)
const line = createLine(db)
const telegram = createTelegram(db)
const telegramBroadcaster = createTelegramBroadcaster(db)
const alerts = createAlerts(db, bus, { line, telegramBroadcaster })
const washout = createWashout(db)
const riskEngine = createRisk(db, washout)
const danger = createDanger(db, { riskEngine, washout })
const harm = createHarm({ riskEngine })
const science = createScience({ db, CONFIG })
const causes = createCauses(db, { riskEngine })
const patterns = createPatterns(db)
const rag = createRag({ db, riskEngine, washout })
const faq = createFaq({ db, rag })
// Bind faq back into rag so the chat endpoint can call logQuestion /
// tryFaqHit. We do this by re-creating rag with faq attached, then
// replacing the methods on the original instance.
const ragWithFaq = createRag({ db, riskEngine, washout, faq })
for (const k of Object.keys(ragWithFaq)) {
  if (typeof ragWithFaq[k] === 'function') rag[k] = ragWithFaq[k]
}

const scheduler = createScheduler({
  db, bus, alerts,
  sources: [air4thai, openmeteo, openmeteoAq, thaiwaterRain, enso, news, imerg, gistdaPm25, pcdNoise, aqHistory],
})

const server = startHttp(buildRoutes({ db, bus, scheduler, riskEngine, washout, danger, harm, causes, patterns, rag, faq, line, telegram, telegramBroadcaster, science, startedAt }))

// Restore daily-quota blocks BEFORE sources start (ported from FloodDash):
// held only in memory, the breaker resets on restart and a process killed
// by a quota storm comes back and immediately re-creates it.
setQuotaStore({
  load: () => { try { return JSON.parse(db.kvGet('api_quota_blocks_v1') ?? 'null') } catch { return null } },
  save: (m) => { try { db.kvSet('api_quota_blocks_v1', JSON.stringify(m)) } catch { /* best effort */ } },
})

scheduler.start()
scheduleRetention(db)

// LINE push tick — every 5 min, check subscribers and push to anyone whose
// province crossed into elevated/high. Self-throttles to one push per
// (token, province) per 3 h, so this is cheap even with thousands of
// subscribers. Uses dynamic import because linePush.js pulls `node:sqlite`
// indirectly and the lazy load keeps boot fast.
// GATED: LINE Notify went EOL on 2025-03-31 (CONFIG.lineNotifyEnabled =
// false) — without the gate every tick would hammer a dead API.
import('./linePush.js').then(({ tickLinePush }) => {
  if (!CONFIG.lineNotifyEnabled) return // LINE Notify EOL 2025-03-31 — see config.js
  setInterval(() => {
    tickLinePush(db).then((r) => {
      if (r.pushed > 0 || r.failed > 0) log('info', 'line-push tick', r)
    }).catch((e) => log('warn', 'line-push tick failed', { error: String(e?.message ?? e) }))
  }, 5 * 60_000).unref()
}).catch(() => { /* linePush not available — silently skip */ })

// Telegram push tick — same cadence and shape as LINE, but Telegram
// (free, unlimited) takes the bulk of the traffic. Same dynamic-import
// pattern so the optional module never blocks boot.
import('./telegramPush.js').then(({ tickTelegramPush }) => {
  setInterval(() => {
    tickTelegramPush(db).then((r) => {
      if (r.pushed > 0 || r.failed > 0) log('info', 'telegram-push tick', r)
    }).catch((e) => log('warn', 'telegram-push tick failed', { error: String(e?.message ?? e) }))
  }, 5 * 60_000).unref()
}).catch(() => { /* telegramPush not available — silently skip */ })

// Weekly data export — every Sunday at 02:00 (Asia/Bangkok), dump every
// DB table to a .tar.gz under data/exports/. The last 8 weeks are kept.
// The same code path serves /api/exports and /api/exports/<filename>,
// so users can list and download the latest archive any time.
import('./weeklyExport.js').then(({ startWeeklyBuild }) => {
  function scheduleWeekly() {
    const now = new Date()
    // Next Sunday 02:00 local time
    const next = new Date(now)
    next.setHours(2, 0, 0, 0)
    const dow = next.getDay() // 0 = Sun
    let daysUntilSun = (7 - dow) % 7
    if (dow === 0 && now.getHours() >= 2) daysUntilSun = 7
    next.setDate(next.getDate() + daysUntilSun)
    const ms = Math.max(60_000, next.getTime() - now.getTime())
    log('info', 'weekly export scheduled', { next_at: next.toISOString(), in_h: +(ms / 3_600_000).toFixed(1) })
    setTimeout(() => {
      // startWeeklyBuild is non-blocking; returns immediately with state
      // and the actual dump runs in the background.
      startWeeklyBuild({ db, riskEngine, startedAt })
      scheduleWeekly()
    }, ms).unref()
  }
  scheduleWeekly()
}).catch(() => { /* weeklyExport not available — silently skip */ })

// Keep the hot-path caches warm so a real page load never pays a cold rebuild.
// A page load after idle used to fire everything at once against a cold OS
// cache and thrash the disk — freezing the single-threaded loop. Keeping the
// working set resident makes every load warm-fast.
{
  const base = `http://127.0.0.1:${CONFIG.port}`
  const warm = (path) => fetch(`${base}${path}`).then((r) => r.arrayBuffer()).catch(() => {})
  const PATHS = [
    '/api/snapshot', '/api/series/daily?days=14', '/api/washout',
    '/api/insights', '/api/export/days?limit=14', '/api/tap/recent?limit=200',
    '/api/library/toc?lang=th',
  ]
  const warmAll = () => { for (const p of PATHS) warm(p) }
  setTimeout(warmAll, 12_000)                    // pre-pay the cold cost once, at boot
  setInterval(() => warm('/api/snapshot'), 8_000).unref() // snapshot TTL is short
  setInterval(warmAll, 45_000).unref()           // keep the rest of the working set resident
}

bus.publish({
  kind: 'system', severity: 0,
  title_th: 'AirDash เริ่มทำงาน — เชื่อมต่อทุกแหล่งข้อมูล',
  title_en: 'AirDash started — connecting all data pipelines',
  payload: { pid: process.pid },
})

// Index knowledge notes after boot; re-attempt daily (covers the LLM coming online later).
setTimeout(() => indexKnowledge(db, rag).catch((e) => log('error', 'knowledge index failed', { error: String(e) })), 10_000)
// Ingest the Air Library corpus once after boot (hash-guarded, idempotent).
setTimeout(() => ingestLibrary(db).catch((e) => log('error', 'library ingest failed', { error: String(e) })), 12_000)
const knowledgeTimer = setInterval(
  () => indexKnowledge(db, rag).catch((e) => log('error', 'knowledge index failed', { error: String(e) })),
  24 * 3600_000,
)
knowledgeTimer.unref()

// Crash-only: log and exit; launchd (KeepAlive) brings the process back.
process.on('uncaughtException', (err) => {
  log('error', 'uncaught exception', { error: String(err?.stack ?? err) })
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  log('error', 'unhandled rejection', { error: String(err?.stack ?? err) })
  process.exit(1)
})
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('info', 'shutting down', { signal: sig })
    server.close()
    process.exit(0)
  })
}
