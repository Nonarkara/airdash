// LINE Official Account alerts — Thailand's default messaging channel.
// Broadcasts severe alerts (severity ≥ 2) to everyone who follows the OA.
//
// Setup (operator, once):
//   1. Create a LINE Official Account and ENABLE the Messaging API on it
//      (developers.line.biz → your provider → the OA's channel → "Messaging
//      API" tab → enable). A plain LINE Login channel CANNOT push — the OAuth
//      token mints fine but every /v2/bot/* call returns 403 "not available
//      for your account". This module detects that and stays dormant.
//   2. Store the channel ID + secret so this module can self-mint and
//      auto-refresh a 30-day channel access token:
//        node scripts/set-line-token.mjs <id> <secret>     (preferred)
//        node scripts/set-line-token.mjs <token>           (legacy, 30d fixed)
//      Or set both via POST /api/admin/line-config.
//   3. Register the webhook (only needed for inbound — see lineWebhook.js):
//      PUT /v2/bot/channel/webhook/endpoint  →  https://api-air.nonarkara.org/api/line/webhook
// Without a *push-capable* token this module is a silent no-op — the dashboard
// never depends on it.
//
// Deliberate throttle: at most one broadcast per LINE_MIN_GAP_MS, batching
// whatever alerts accumulated in between. Haze episodes fire many station
// alerts at once; followers should get one readable digest, not a machine-gun
// of pushes (also: free-tier OAs have a monthly message quota).
import { log } from './util.js'

const LINE_MIN_GAP_MS = 30 * 60_000
const MAX_LINES_PER_PUSH = 6
const RETRY_DELAY_MS = 60_000        // reschedule after a fully-failed send
const MAX_QUEUE = 200                // backstop: never grow unbounded if LINE is down for days

// Bilingual section headers for the broadcast groups — same severity
// table the citizen panel + danger engine use, so a push feels
// consistent with what the user sees in the dashboard. The "rule"
// (pm25_level, aqi_level, washout_rain) gives the section a name so
// two rules at the same severity still get separate sub-headings —
// matches the FloodDash "น้ำล้นตลิ่ง (ระดับ 5)" / "น้ำมาก (ระดับ 4)"
// pattern where event-type AND level define the section.
const SEVERITY_HEADERS = {
  th: {
    3: { pm25_level: '🔴 อันตราย (ระดับ 3) — PM2.5 ≥ 75 µg/m³',
         aqi_level: '🔴 AQI อันตราย (ระดับ 3) — AQI ≥ 150',
         default: '🔴 อันตราย (ระดับ 3)' },
    2: { pm25_level: '🟠 มีผลต่อสุขภาพ (ระดับ 2) — PM2.5 ≥ 37.5 µg/m³',
         aqi_level: '🟠 AQI เกินเกณฑ์ (ระดับ 2) — AQI ≥ 100',
         default: '🟠 มีผลต่อสุขภาพ (ระดับ 2)' },
  },
  en: {
    3: { pm25_level: '🔴 Hazardous (level 3) — PM2.5 ≥ 75 µg/m³',
         aqi_level: '🔴 AQI hazardous (level 3) — AQI ≥ 150',
         default: '🔴 Hazardous (level 3)' },
    2: { pm25_level: '🟠 Unhealthy (level 2) — PM2.5 ≥ 37.5 µg/m³',
         aqi_level: '🟠 AQI past unhealthy (level 2) — AQI ≥ 100',
         default: '🟠 Unhealthy (level 2)' },
  },
}

function sectionHeaderTh(severity, rule) {
  const lvl = SEVERITY_HEADERS.th[severity] ?? SEVERITY_HEADERS.th[2]
  return lvl[rule] ?? lvl.default
}
function sectionHeaderEn(severity, rule) {
  const lvl = SEVERITY_HEADERS.en[severity] ?? SEVERITY_HEADERS.en[2]
  return lvl[rule] ?? lvl.default
}

// One bullet = "จ.เชียงใหม่ · 85 µg/m³" or "จ.เชียงใหม่ (PM2.5 85)".
// Falls back gracefully when the structured fields are absent — the
// legacy per-station message_th is still useful for the bullet text.
function bulletTh(item) {
  const prov = item.province_th ? `จ.${item.province_th}` : (item.station_name_th ?? '—')
  if (item.value != null) return `${prov} · ${Math.round(item.value)} µg/m³`
  if (item.message_th) return `${prov} · ${item.message_th}`
  return prov
}
function bulletEn(item) {
  const prov = item.province_en || item.province_th || item.station_name_en || '—'
  if (item.value != null) return `${prov} · ${Math.round(item.value)} µg/m³`
  if (item.message_en) return `${prov} · ${item.message_en}`
  return prov
}

// Auto-refresh: LINE's client_credentials token lives 30 days. Re-mint well
// before expiry so it never dies silently mid-season. A 30-day token that
// stops working during a haze episode is exactly the failure this system
// can't have.
const TOKEN_MAX_AGE_MS = 25 * 24 * 3600_000
// canPush() probe cache: don't hammer /v2/bot/info on every alert. On the
// wrong channel type this returns false and keeps the module dormant instead
// of spamming 403s and dropping alert batches.
const PUSH_PROBE_TTL_MS = 30 * 60_000

export function createLine(db) {
  let queue = []
  let timer = null
  let timerAt = 0                   // absolute ms when the pending timer fires
  let sending = false               // guard: never run two broadcasts at once
  let pushProbe = { at: 0, ok: false } // cached result of the "can this token push?" check

  const token = () => db.kvGet('line_channel_token')

  // Mint a fresh 30-day channel access token from the stored channel id/secret.
  // Returns the token string or null (missing creds / mint failed).
  async function mintToken() {
    const id = db.kvGet('line_channel_id')
    const secret = db.kvGet('line_channel_secret')
    if (!id || !secret) return null
    try {
      const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials', client_id: id, client_secret: secret,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200)
        log('warn', 'LINE token mint failed', { status: res.status, body })
        return null
      }
      const j = await res.json()
      if (!j.access_token) return null
      db.kvSet('line_channel_token', j.access_token)
      db.kvSet('line_token_minted_at', String(Date.now()))
      log('info', 'LINE channel token minted/refreshed', { expires_in_days: Math.round((j.expires_in ?? 0) / 86400) })
      return j.access_token
    } catch (err) {
      log('warn', 'LINE token mint error', { error: String(err?.message ?? err) })
      return null
    }
  }

  // Ensure we have a token that isn't near expiry. Re-mints from channel
  // id/secret when the stored one is >25 days old (or absent but creds exist).
  async function ensureFreshToken() {
    const mintedAt = Number(db.kvGet('line_token_minted_at') ?? 0)
    const stale = !token() || (Date.now() - mintedAt) > TOKEN_MAX_AGE_MS
    if (stale && db.kvGet('line_channel_id')) {
      await mintToken()
    }
    return token()
  }

  // Can the current token actually push (i.e. is this a Messaging API channel)?
  // Cached — a LINE Login channel returns 403 here and we stay dormant.
  async function canPush() {
    const t = token()
    if (!t) return false
    if (Date.now() - pushProbe.at < PUSH_PROBE_TTL_MS) return pushProbe.ok
    try {
      const res = await fetch('https://api.line.me/v2/bot/info', {
        headers: { authorization: `Bearer ${t}` },
        signal: AbortSignal.timeout(10_000),
      })
      pushProbe = { at: Date.now(), ok: res.ok }
      if (!res.ok) {
        log('warn', 'LINE token cannot push — channel is not Messaging-API-enabled (dormant)', { status: res.status })
      }
      return res.ok
    } catch {
      // Network blip — assume still ok if we previously verified, else false.
      return pushProbe.ok
    }
  }

  // Keep the SOONEST pending flush. A later request (e.g. a 60s post-failure
  // retry) must not block a sooner one (a fresh critical alert), and a later
  // request must not delay an already-sooner timer.
  function schedule(delayMs) {
    const at = Date.now() + delayMs
    if (timer && at >= timerAt) return
    if (timer) clearTimeout(timer)
    timerAt = at
    timer = setTimeout(() => { timer = null; flush() }, delayMs)
    timer.unref?.()
  }

  // Build the broadcast text the FloodDash way: group by severity band
  // (3 = hazardous, 2 = unhealthy, 1 = notable), dedupe by province so a
  // haze episode with 8 stations in Chiang Mai shows one bullet, and
  // overflow past MAX_LINES_PER_PUSH becomes "…และอีก N จังหวัด".
  // Returns { th, en } so callers (the Telegram broadcaster mirrors
  // this) can pick the right language.
  function buildBroadcast(alerts) {
    // Group by (severity, rule) so e.g. PM2.5 ≥ 75 and AQI ≥ 100 each
    // get their own sub-section under the same severity header. This
    // matches the FloodDash screenshot exactly: "น้ำล้นตลิ่ง (ระดับ 5)"
    // and "น้ำมาก (ระดับ 4)" are separate sections under the same level.
    const groups = new Map()
    for (const a of alerts) {
      const sev = a.severity ?? 2
      const key = `${sev}:${a.rule ?? 'unknown'}`
      if (!groups.has(key)) groups.set(key, { severity: sev, rule: a.rule, items: [] })
      groups.get(key).items.push(a)
    }
    // Order by severity desc, then rule alphabetically for stability.
    const sorted = [...groups.values()].sort((a, b) =>
      b.severity - a.severity || (a.rule ?? '').localeCompare(b.rule ?? ''))

    // Build bilingual sections.
    const out = { th: [], en: [] }
    for (const g of sorted) {
      // Dedupe by province: keep the worst reading per province so a
      // province with 8 stations crossing the threshold still shows
      // ONE bullet (FloodDash pattern). The worst value wins.
      const byProv = new Map() // province_th → { value, item }
      for (const item of g.items) {
        const k = item.province_th || item.province_en || item.station_name_th || 'unknown'
        const cur = byProv.get(k)
        if (!cur || (item.value ?? 0) > (cur.value ?? 0)) byProv.set(k, item)
      }
      const deduped = [...byProv.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

      // Section header — language-mirrored.
      const thHead = sectionHeaderTh(g.severity, g.rule)
      const enHead = sectionHeaderEn(g.severity, g.rule)
      out.th.push(thHead)
      out.en.push(enHead)

      // Items.
      const shown = deduped.slice(0, MAX_LINES_PER_PUSH)
      const overflow = deduped.length - shown.length
      for (const item of shown) {
        out.th.push('• ' + bulletTh(item))
        out.en.push('• ' + bulletEn(item))
      }
      if (overflow > 0) {
        out.th.push(`…และอีก ${overflow} จังหวัด`)
        out.en.push(`…and ${overflow} more province${overflow === 1 ? '' : 's'}`)
      }
      out.th.push('') // blank line between groups
      out.en.push('')
    }
    return {
      th: `🌫️ AirDash แจ้งเตือนฝุ่น\n${out.th.join('\n')}\nดูสด: https://air.nonarkara.org\nโปรดติดตามประกาศ คพ./กรมอุตุฯ`,
      en: `🌫️ AirDash dust alert\n${out.en.join('\n')}\nLive: https://air.nonarkara.org\nFollow PCD/TMD announcements`,
    }
  }

  async function flush() {
    if (sending) { schedule(RETRY_DELAY_MS); return } // a send is already in flight
    if (queue.length === 0) return
    const t = await ensureFreshToken()
    if (!t) return
    if (!(await canPush())) return   // dormant on a non-Messaging-API channel
    // Snapshot the batch OUT of the queue up front. Alerts that arrive during
    // the (up to ~30s) send window then land in a fresh queue and are NOT
    // wiped when this send succeeds — the drop-on-success race in the previous
    // version. On failure we return this exact batch to the front.
    const batch = queue.splice(0)
    sending = true
    const built = buildBroadcast(batch)
    // LINE OA follows the user's lang setting; LINE's `language` field on
    // the broadcast endpoint is unreliable across regions, so we send BOTH
    // languages back-to-back as a single message. 5000-char cap on LINE
    // broadcast — both versions are well under it.
    const text = `${built.th}\n\n— — —\n\n${built.en}`
    const body = JSON.stringify({ messages: [{ type: 'text', text }] })
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${t}` }
    try {
      // One retry: LINE occasionally 500s on transient infra issues.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'POST', headers, body, signal: AbortSignal.timeout(15_000),
          })
          if (res.ok) {
            db.kvSet('line_last_push', String(Date.now()))
            log('info', 'LINE broadcast sent', { alerts: batch.length, attempt })
            return
          }
          if (res.status === 401 || res.status === 403) {
            // Token went bad (rotated/expired/wrong channel). Force a re-probe
            // + re-mint next cycle; drop this batch rather than balloon memory.
            pushProbe = { at: 0, ok: false }
            log('error', 'LINE auth rejected — will re-probe/re-mint; batch dropped', { status: res.status, dropped: batch.length })
            return
          }
          log('warn', 'LINE broadcast failed', { status: res.status, body: (await res.text()).slice(0, 200), attempt })
        } catch (err) {
          log('warn', 'LINE broadcast error', { error: String(err?.message ?? err), attempt })
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 3000))
      }
      // Both attempts failed: return the batch to the FRONT of the queue and
      // reschedule so these alerts are retried, not lost.
      queue.unshift(...batch)
      if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE
      log('error', 'LINE broadcast failed after 2 attempts — batch requeued for retry', { queued: queue.length })
      schedule(RETRY_DELAY_MS)
    } finally {
      sending = false
    }
  }

  /** Queue a severe alert; batched into ≤1 broadcast per 30 minutes. */
  function notifyAlert(alert) {
    if (!token() && !db.kvGet('line_channel_id')) return // not configured — free no-op
    if ((alert.severity ?? 0) < 2) return
    queue.push(alert)
    if (queue.length > MAX_QUEUE) queue.shift() // drop oldest; keep bounded
    const last = Number(db.kvGet('line_last_push') ?? 0)
    schedule(Math.max(5_000, LINE_MIN_GAP_MS - (Date.now() - last)))
  }

  // Refresh the token proactively once a day so it's never near expiry when an
  // alert needs to go out. Cheap no-op when creds are absent.
  const refreshTimer = setInterval(() => { ensureFreshToken().catch(() => {}) }, 24 * 3600_000)
  refreshTimer.unref?.()

  return {
    notifyAlert,
    configured: () => Boolean(token()) || Boolean(db.kvGet('line_channel_id')),
    canPush,
    ensureFreshToken,
    mintToken,
    /** Build the bilingual broadcast text from a list of structured alerts
     *  — exposed so the Telegram broadcaster (and admin preview) can
     *  reuse the same FloodDash-style formatter. */
    buildBroadcast,
    /** Operator diagnostic — for the admin panel /api/admin/line-status. */
    status: () => ({
      has_token: Boolean(token()),
      has_id_secret: Boolean(db.kvGet('line_channel_id') && db.kvGet('line_channel_secret')),
      minted_at: db.kvGet('line_token_minted_at'),
      last_push: db.kvGet('line_last_push'),
      probe_ok: pushProbe.ok,
      probe_age_s: pushProbe.at ? Math.round((Date.now() - pushProbe.at) / 1000) : null,
      queue_depth: queue.length,
    }),
  }
}
