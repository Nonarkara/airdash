// Telegram per-chat push notifications — second push channel because the
// LINE free tier caps at 300 messages/month (a single haze episode will
// blow through that in 3 days). Telegram Bot API is free and effectively
// unlimited for one-to-one user messages.
//
// Citizens link their Telegram chat to AirDash by:
//   1. Dashboard generates a binding code (6 chars).
//   2. User taps t.me/AirDash_bot?start=<code> on their phone.
//   3. Bot receives /start <code> → stores chat_id + code in telegram_subs.
//   4. User picks province + language in the dashboard.
//   5. The binding_code is the temporary handshake that ties chat_id to
//      their session — they never have to copy a chat_id by hand.
//
// What this module exports:
//   - tickTelegramPush(db)         → cron 5min, walks risk snapshot, pushes
//                                    to subscribers whose province is
//                                    elevated/high. Throttled to 1/(chat,prov)
//                                    per 3 h. Returns {pushed, failed, scanned}.
//   - buildMessage(prov_th, prov_en, band, score, lang) → HTML string,
//                                    used by /api/telegram/preview so the UI
//                                    can show "this is what you'll get".
//   - sendTelegram(db, chatId, text) → low-level one-shot send (used to
//                                    validate a chat is reachable).
//   - notifySubscribersForAlert(db, alert) → wires the alert engine's
//                                    fan-out so severe alerts (sev ≥ 2)
//                                    reach the right subscribers without
//                                    waiting for the next cron tick.
//   - generateBindingCode(db)      → 6-char handshake token for the
//                                    citizen panel's "Connect on Telegram"
//                                    button. One per dashboard session.
import { log } from './util.js'
import { createTelegram } from './telegram.js'

const PER_SUB_GAP_MS = 3 * 60 * 60_000
const MAX_FAIL_COUNT = 5
const BINDING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // skip 0/O/1/I/L
const BINDING_CODE_LEN = 6

// Same severity table feeds the top-bar danger chip and the citizen mode
// panel — this is the Telegram-side mirror so a push feels consistent
// with the UI. Emoji renders natively in Telegram, so we lean into it.
const BAND_HEADLINE = {
  th: {
    normal:   { emoji: '✅', verb: 'อากาศดี', action: 'ใช้ชีวิตกลางแจ้งได้ตามปกติ' },
    watch:    { emoji: '⚠️', verb: 'เริ่มมีผลต่อสุขภาพ', action: 'กลุ่มเสี่ยงลดกิจกรรมกลางแจ้ง' },
    elevated: { emoji: '🟠', verb: 'มีผลต่อสุขภาพ', action: 'สวม N95 · ปิดหน้าต่าง' },
    high:     { emoji: '🔴', verb: 'อันตราย', action: 'งดกิจกรรมกลางแจ้ง · อยู่ในอาคาร' },
  },
  en: {
    normal:   { emoji: '✅', verb: 'Good air', action: 'Outdoor life as usual' },
    watch:    { emoji: '⚠️', verb: 'Starting to affect health', action: 'Sensitive groups: limit outdoor exertion' },
    elevated: { emoji: '🟠', verb: 'Unhealthy', action: 'Wear N95 · close windows' },
    high:     { emoji: '🔴', verb: 'Hazardous', action: 'Stay indoors · avoid all outdoor activity' },
  },
}

// Build the exact message a subscriber will receive. Exported separately
// so the citizen panel can show "this is what you'll get" in
// /api/telegram/preview. Telegram's default parse_mode is HTML so we
// emit a small inline button row at the bottom (open dashboard, stop).
// 'lang' is 'th' | 'en' (defaults to 'th'). The live link and stop
// command are rendered in the same language so the user always knows
// how to opt out.
export function buildMessage(province_th, province_en, band, score, lang = 'th') {
  const safeBand = BAND_HEADLINE[lang]?.[band] ? band : 'watch'
  const head = BAND_HEADLINE[lang][safeBand]
  const pTh = province_th || (lang === 'en' ? 'Thailand' : 'ประเทศไทย')
  const pEn = province_en || pTh
  const display = lang === 'en' ? pEn : pTh
  const provinceLabel = lang === 'en' ? 'Province' : 'จังหวัด'
  const scoreLabel = 'Air Watch Score'
  const actionLabel = lang === 'en' ? 'What to do' : 'คำแนะนำ'
  const liveLabel = lang === 'en' ? 'Live: https://air.nonarkara.org' : 'ดูสด: https://air.nonarkara.org'
  const stopLabel = lang === 'en' ? '/stop to unsubscribe' : '/stop เพื่อยกเลิก'
  const hotline = lang === 'en' ? 'Hotlines: 1650 pollution · 1422 DDC health · 1669 EMS'
                                  : 'สายด่วน: 1650 มลพิษ · 1422 สธ. · 1669 ฉุกเฉิน'
  return (
    `${head.emoji} <b>${head.verb}</b>\n` +
    `${provinceLabel}: <b>${escapeHtml(display)}</b>\n` +
    `${scoreLabel}: <b>${score}/100</b>\n` +
    `${actionLabel}: ${head.action}\n\n` +
    `${liveLabel}\n` +
    `${hotline}\n` +
    `<i>${stopLabel}</i>`
  )
}

// Tiny HTML escaper for user-supplied province names. Telegram's
// parse_mode=HTML is strict — unescaped < > & would 400 the send.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// True when a send failure means the chat is permanently gone (account
// deleted, chat never existed): Telegram answers HTTP 400 with a
// description of "chat not found" or "user is deactivated". These are
// purged immediately like 403s instead of burning the 5-strike budget.
export function isDeadChat(err) {
  if (err?.status !== 400) return false
  return /chat not found|user is deactivated/i.test(String(err?.message ?? ''))
}

// Reassuring all-clear message — sent when a station's PM2.5 falls back
// below 25 µg/m³ sustained (rule pm25_all_clear in alerts.js). Deliberately
// NOT the danger template: the user who got a red push should hear the
// good news in a calm voice. Profile-agnostic bilingual copy.
export function buildAllClearMessage(province_th, province_en, lang = 'th') {
  const pTh = province_th || (lang === 'en' ? 'Thailand' : 'ประเทศไทย')
  const pEn = province_en || pTh
  const display = lang === 'en' ? pEn : pTh
  const provinceLabel = lang === 'en' ? 'Province' : 'จังหวัด'
  const body = lang === 'en'
    ? 'PM2.5 is back below 25 µg/m³ and holding — the air has cleared. Safe to go out and enjoy the day.'
    : 'PM2.5 ลดลงต่ำกว่า 25 µg/m³ ต่อเนื่องแล้ว — อากาศดีขึ้นแล้ว ออกไปข้างนอก ใช้ชีวิตได้ตามปกติ'
  const liveLabel = lang === 'en' ? 'Live: https://air.nonarkara.org' : 'ดูสด: https://air.nonarkara.org'
  const stopLabel = lang === 'en' ? '/stop to unsubscribe' : '/stop เพื่อยกเลิก'
  return (
    `✅ <b>${lang === 'en' ? 'Air has cleared' : 'อากาศดีขึ้นแล้ว'}</b>\n` +
    `${provinceLabel}: <b>${escapeHtml(display)}</b>\n` +
    `${body}\n\n` +
    `${liveLabel}\n` +
    `<i>${stopLabel}</i>`
  )
}

// One-shot Telegram send. Throws on non-2xx so subscribe handlers can
// decide what to tell the user; alert fan-out wraps in try/catch and
// converts to a fail_count bump.
export async function sendTelegram(db, chatId, text, opts = {}) {
  const tg = createTelegram(db)
  await tg.sendMessage(chatId, text, opts)
}

// Generate a 6-char binding code for a dashboard session. Returned to
// the citizen panel; the user then taps t.me/AirDash_bot?start=<code>.
// Codes are unique (checked against telegram_subs.binding_code before
// insert); the alphabet skips 0/O/1/I/L to keep codes tap-friendly.
export function generateBindingCode(db) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = ''
    for (let i = 0; i < BINDING_CODE_LEN; i++) {
      code += BINDING_CODE_ALPHABET[Math.floor(Math.random() * BINDING_CODE_ALPHABET.length)]
    }
    const exists = db.get('SELECT 1 AS x FROM telegram_subs WHERE binding_code = ?', code)
    if (!exists) return code
  }
  // Astronomically unlikely — 32^6 = ~1B codes, 5 tries with no hit.
  throw new Error('could not generate unique binding code')
}

// Bind a chat_id to a province + language. Called by the citizen panel
// after the bot confirms the chat is reachable (the /start handler in
// telegramWebhook.js only stores the chat_id; the province + language
// arrive here from the dashboard). Idempotent on chat_id (re-binding
// the same chat just updates the province).
export function bindChat(db, { chatId, code, province_th, province_en, province_code, lang }) {
  if (!Number.isFinite(chatId)) throw new Error('chatId required')
  if (!province_th) throw new Error('province_th required')
  if (!code) throw new Error('binding code required')

  // AUTHORIZATION — the binding code is the ONLY proof that the caller
  // controls this chat. It is minted per browser session
  // (/api/telegram/binding-code) and can only reach telegram_subs by the
  // user typing /start <code> into the bot from that chat, so possessing
  // a code that matches this chat_id proves ownership of both ends.
  //
  // Without this check the endpoint was an IDOR: any unauthenticated
  // caller could POST an arbitrary chat_id and silently re-point an
  // existing subscriber's alerts at another province — a life-safety
  // integrity bug (a Chiang Mai subscriber during burning season would
  // receive "air is fine" pushes for a clean province while their own
  // air was hazardous), plus a spam-enrolment vector against the bot.
  const owner = db.get(
    'SELECT id, chat_id FROM telegram_subs WHERE binding_code = ?',
    String(code).toUpperCase())
  if (!owner || Number(owner.chat_id) !== Number(chatId)) {
    throw new Error('binding code does not match this chat')
  }

  const now = new Date().toISOString()
  // Clearing binding_code on success makes the code single-use: a
  // replayed or leaked code cannot re-bind the chat afterwards.
  db.run(`UPDATE telegram_subs SET province_th = ?, province_en = ?, province_code = ?,
          lang = ?, binding_code = NULL, fail_count = 0, active = 1, updated_at = ?
          WHERE id = ?`,
    province_th, province_en ?? null, province_code ?? null, lang ?? 'th', now, owner.id)
  return { ok: true, updated: true }
}

// Cron entry point — called by server/index.js every 5 min. Walks the
// latest risk snapshot (or, if not yet built, reads the most recent
// province band per the daily rollup) and pushes to any active subscriber
// whose province is in 'elevated' or 'high' AND who hasn't been notified
// for that province in PER_SUB_GAP_MS. Cheap: the sub table is at most
// a few thousand rows; the gap check is one indexed column.
export async function tickTelegramPush(db) {
  const subs = db.all(
    `SELECT id, chat_id, province_th, province_en, province_code, lang, last_notified_at
     FROM telegram_subs
     WHERE active = 1
       AND province_th IS NOT NULL
       AND (last_notified_at IS NULL OR (strftime('%s','now') - strftime('%s', last_notified_at)) * 1000 > ?)`,
    PER_SUB_GAP_MS,
  )
  if (!subs.length) return { pushed: 0, failed: 0, scanned: 0 }

  // Province bands for this run — the risk module caches the latest
  // snapshot under the 'risk_provinces' key in kv. Fall back to empty
  // if the cache is cold (boot, ingestion gap); the tick is a no-op.
  const cached = db.kvGet('risk_provinces')
  if (!cached) return { pushed: 0, failed: 0, scanned: subs.length }
  let provinces
  try { provinces = JSON.parse(cached) } catch { return { pushed: 0, failed: 0, scanned: subs.length } }

  const bandByCode = new Map()
  const bandByName = new Map()
  for (const p of provinces) {
    if (p.province_code) bandByCode.set(String(p.province_code), p)
    if (p.province_th) bandByName.set(p.province_th, p)
    if (p.province_en) bandByName.set(p.province_en.toLowerCase(), p)
  }

  const tg = createTelegram(db)
  let pushed = 0, failed = 0
  for (const sub of subs) {
    const live =
      (sub.province_code && bandByCode.get(String(sub.province_code))) ||
      (sub.province_th && bandByName.get(sub.province_th)) ||
      (sub.province_en && bandByName.get(sub.province_en.toLowerCase()))
    if (!live) continue
    if (live.band !== 'elevated' && live.band !== 'high') continue
    const text = buildMessage(sub.province_th, sub.province_en, live.band, live.score ?? 0, sub.lang || 'th')
    try {
      await tg.sendMessage(sub.chat_id, text)
      db.run(`UPDATE telegram_subs SET last_notified_at = datetime('now'), fail_count = 0, updated_at = datetime('now') WHERE id = ?`, sub.id)
      pushed++
    } catch (err) {
      failed++
      const newCount = (sub.fail_count ?? 0) + 1
      // 401/403/429-persistent: user blocked the bot, kicked it, or
      // repeated rate-limit. 400 "chat not found" / "user is deactivated"
      // means the account is gone — equally permanent. Purge so the next
      // tick doesn't waste sends on dead chats; other errors keep the
      // 5-strike logic.
      if (err.status === 401 || err.status === 403 || isDeadChat(err) || newCount >= MAX_FAIL_COUNT) {
        db.run(`DELETE FROM telegram_subs WHERE id = ?`, sub.id)
        log('warn', 'telegram subscriber purged', { id: sub.id, status: err.status, fail_count: newCount })
      } else {
        db.run(`UPDATE telegram_subs SET fail_count = ?, updated_at = datetime('now') WHERE id = ?`, newCount, sub.id)
      }
      log('warn', 'telegram send failed', { id: sub.id, status: err.status, error: String(err?.message ?? err) })
    }
  }
  return { pushed, failed, scanned: subs.length }
}

// Fan-out from the alert engine. When alerts.js fires a sev-2+ alert we
// also want every active subscriber for that province to get a push NOW
// (not wait up to 5 min for the next tick). The cron tick is still
// authoritative — this is the fast path so a fresh spike feels instant.
// All-clear alerts (rule pm25_all_clear) ride the same path with their own
// reassuring template; they ignore the 3 h per-sub gap (a subscriber who
// just got a danger push SHOULD hear the all-clear right away — the
// alert's own 12 h cooldown is the spam guard).
// `alert` is { province_th, province_en, province_code, severity, rule, message_th, message_en }.
export async function notifySubscribersForAlert(db, alert) {
  const isAllClear = alert?.rule === 'pm25_all_clear'
  if (!alert || (!isAllClear && (alert.severity ?? 0) < 2)) return { pushed: 0, failed: 0 }
  if (!alert.province_th && !alert.province_en && !alert.province_code) {
    return { pushed: 0, failed: 0 }
  }
  const subs = db.all(
    `SELECT id, chat_id, province_th, province_en, lang, last_notified_at
     FROM telegram_subs
     WHERE active = 1
       AND (last_notified_at IS NULL OR (strftime('%s','now') - strftime('%s', last_notified_at)) * 1000 > ?)
       AND (
         province_code = ? OR
         province_th = ? OR
         LOWER(province_en) = LOWER(?)
       )`,
    isAllClear ? 0 : PER_SUB_GAP_MS,
    alert.province_code ?? '',
    alert.province_th ?? '',
    alert.province_en ?? '',
  )
  if (!subs.length) return { pushed: 0, failed: 0 }

  const tg = createTelegram(db)
  let pushed = 0, failed = 0
  for (const sub of subs) {
    const text = isAllClear
      ? buildAllClearMessage(alert.province_th ?? sub.province_th, alert.province_en ?? sub.province_en, sub.lang || 'th')
      : buildMessage(
        alert.province_th ?? sub.province_th,
        alert.province_en ?? sub.province_en,
        alert.severity >= 3 ? 'high' : 'elevated',
        alert.severity >= 3 ? 80 : 60,
        sub.lang || 'th',
      )
    try {
      await tg.sendMessage(sub.chat_id, text)
      db.run(`UPDATE telegram_subs SET last_notified_at = datetime('now'), fail_count = 0, updated_at = datetime('now') WHERE id = ?`, sub.id)
      pushed++
    } catch (err) {
      failed++
      const newCount = (sub.fail_count ?? 0) + 1
      if (err.status === 401 || err.status === 403 || isDeadChat(err) || newCount >= MAX_FAIL_COUNT) {
        db.run(`DELETE FROM telegram_subs WHERE id = ?`, sub.id)
        log('warn', 'telegram subscriber purged (alert)', { id: sub.id, status: err.status })
      } else {
        db.run(`UPDATE telegram_subs SET fail_count = ?, updated_at = datetime('now') WHERE id = ?`, newCount, sub.id)
      }
      log('warn', 'telegram alert send failed', { id: sub.id, status: err.status, error: String(err?.message ?? err) })
    }
  }
  return { pushed, failed }
}

// ── Telegram OA-style broadcast (mirrors server/line.js) ────────────────
// Second push channel: when an area hits "very high pollution" (severity
// ≥ 2), a single batched message goes to EVERY active Telegram
// subscriber — same FloodDash pattern as the LINE OA. The per-subscriber
// push above is still the targeted path (only the user whose province
// crossed the threshold); this is the catch-all "Thailand just got
// worse" alert that reaches everyone, including users who haven't picked
// a province yet.
//
// Why both: the per-subscriber path is the personal, low-noise daily
// experience. The broadcaster is the loud, infrequent, "everyone should
// know" signal — the analog of a TV emergency broadcast. Same throttle
// (≤1 push per 30 min) so a haze episode doesn't spam every chat.
//
// Format mirrors LINE exactly so users who follow both see the same
// digest — only the wrapping HTML (Telegram parse_mode) differs.

const BROADCAST_MIN_GAP_MS = 30 * 60_000
const BROADCAST_MAX_LINES = 6
const BROADCAST_RETRY_DELAY_MS = 60_000
const BROADCAST_MAX_QUEUE = 200

// Section header tables — same wording as line.js so users see one
// consistent voice across channels. Inline <b> for Telegram parse_mode.
const BROADCAST_HEADERS = {
  th: {
    3: { pm25_level: '🔴 <b>อันตราย (ระดับ 3)</b> — PM2.5 ≥ 75 µg/m³',
         aqi_level: '🔴 <b>AQI อันตราย (ระดับ 3)</b> — AQI ≥ 150',
         default: '🔴 <b>อันตราย (ระดับ 3)</b>' },
    2: { pm25_level: '🟠 <b>มีผลต่อสุขภาพ (ระดับ 2)</b> — PM2.5 ≥ 37.5 µg/m³',
         aqi_level: '🟠 <b>AQI เกินเกณฑ์ (ระดับ 2)</b> — AQI ≥ 100',
         default: '🟠 <b>มีผลต่อสุขภาพ (ระดับ 2)</b>' },
  },
  en: {
    3: { pm25_level: '🔴 <b>Hazardous (level 3)</b> — PM2.5 ≥ 75 µg/m³',
         aqi_level: '🔴 <b>AQI hazardous (level 3)</b> — AQI ≥ 150',
         default: '🔴 <b>Hazardous (level 3)</b>' },
    2: { pm25_level: '🟠 <b>Unhealthy (level 2)</b> — PM2.5 ≥ 37.5 µg/m³',
         aqi_level: '🟠 <b>AQI past unhealthy (level 2)</b> — AQI ≥ 100',
         default: '🟠 <b>Unhealthy (level 2)</b>' },
  },
}

// Build the broadcast text the same way as line.js but with HTML bold
// around the section headers + province names (Telegram parse_mode
// reads HTML). Returns the th + en variants so a single user who has
// both channels sees the same data either way.

function buildBroadcast(alerts) {
  const groups = new Map()
  for (const a of alerts) {
    const sev = a.severity ?? 2
    const key = `${sev}:${a.rule ?? 'unknown'}`
    if (!groups.has(key)) groups.set(key, { severity: sev, rule: a.rule, items: [] })
    groups.get(key).items.push(a)
  }
  const sorted = [...groups.values()].sort((a, b) =>
    b.severity - a.severity || (a.rule ?? '').localeCompare(b.rule ?? ''))

  const out = { th: [], en: [] }
  for (const g of sorted) {
    // Dedupe by province — keep the worst reading per province.
    const byProv = new Map()
    for (const item of g.items) {
      const k = item.province_th || item.province_en || item.station_name_th || 'unknown'
      const cur = byProv.get(k)
      if (!cur || (item.value ?? 0) > (cur.value ?? 0)) byProv.set(k, item)
    }
    const deduped = [...byProv.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    const thHead = (BROADCAST_HEADERS.th[g.severity] ?? BROADCAST_HEADERS.th[2])[g.rule]
      ?? BROADCAST_HEADERS.th[g.severity ?? 2].default
    const enHead = (BROADCAST_HEADERS.en[g.severity] ?? BROADCAST_HEADERS.en[2])[g.rule]
      ?? BROADCAST_HEADERS.en[g.severity ?? 2].default
    out.th.push(thHead)
    out.en.push(enHead)

    const shown = deduped.slice(0, BROADCAST_MAX_LINES)
    const overflow = deduped.length - shown.length
    for (const item of shown) {
      const provTh = item.province_th ? `จ.${escapeHtml(item.province_th)}` : (item.station_name_th ?? '—')
      const provEn = escapeHtml(item.province_en || item.province_th || item.station_name_en || '—')
      if (item.value != null) {
        out.th.push(`• <b>${provTh}</b> · ${Math.round(item.value)} µg/m³`)
        out.en.push(`• <b>${provEn}</b> · ${Math.round(item.value)} µg/m³`)
      } else {
        out.th.push(`• <b>${provTh}</b>`)
        out.en.push(`• <b>${provEn}</b>`)
      }
    }
    if (overflow > 0) {
      out.th.push(`…และอีก ${overflow} จังหวัด`)
      out.en.push(`…and ${overflow} more province${overflow === 1 ? '' : 's'}`)
    }
    out.th.push('')
    out.en.push('')
  }
  return {
    th: `🌫️ <b>AirDash แจ้งเตือนฝุ่น</b>\n${out.th.join('\n')}\nดูสด: https://air.nonarkara.org\nโปรดติดตามประกาศ คพ./กรมอุตุฯ`,
    en: `🌫️ <b>AirDash dust alert</b>\n${out.en.join('\n')}\nLive: https://air.nonarkara.org\nFollow PCD/TMD announcements`,
  }
}

export function createTelegramBroadcaster(db) {
  let queue = []
  let timer = null
  let timerAt = 0
  let sending = false

  const token = () => db.kvGet('telegram_bot_token')

  function schedule(delayMs) {
    const at = Date.now() + delayMs
    if (timer && at >= timerAt) return
    if (timer) clearTimeout(timer)
    timerAt = at
    timer = setTimeout(() => { timer = null; flush() }, delayMs)
    timer.unref?.()
  }

  async function flush() {
    if (sending) { schedule(BROADCAST_RETRY_DELAY_MS); return }
    if (queue.length === 0) return
    if (!token()) return // not configured — free no-op
    const batch = queue.splice(0)
    sending = true
    const tg = createTelegram(db)
    const built = buildBroadcast(batch)
    // Get the snapshot of active subscribers AT FLUSH TIME. A user who
    // /stops between scheduling and the flush won't be in this list.
    let subs
    try {
      subs = db.all(
        `SELECT id, chat_id, lang FROM telegram_subs WHERE active = 1`)
    } catch (err) {
      log('error', 'telegram broadcaster: subs query failed', { error: String(err?.message ?? err) })
      sending = false
      return
    }
    if (!subs.length) {
      log('info', 'telegram broadcaster: no active subs, dropped batch', { alerts: batch.length })
      sending = false
      return
    }
    let ok = 0, fail = 0, blocked = 0
    for (const sub of subs) {
      // Send the user's preferred language. Falls back to Thai.
      const text = sub.lang === 'en' ? built.en : built.th
      try {
        await tg.sendMessage(sub.chat_id, text)
        ok++
      } catch (err) {
        fail++
        // 403 = user blocked the bot. Purge so the next flush doesn't
        // waste a send on a dead chat. 401 = bot-wide auth failure —
        // stop the whole batch (other chats will also fail).
        if (err.status === 401) {
          log('error', 'telegram broadcaster: bot auth failed — aborting batch', { status: err.status })
          sending = false
          return
        }
        // 403 = user blocked the bot; 400 "chat not found"/"user is
        // deactivated" = the account is gone. Both are permanent — purge.
        if (err.status === 403 || isDeadChat(err)) {
          db.run(`DELETE FROM telegram_subs WHERE id = ?`, sub.id)
          blocked++
        }
        log('warn', 'telegram broadcaster send failed', { chat_id: sub.chat_id, status: err.status, error: String(err?.message ?? err) })
      }
    }
    db.kvSet('telegram_broadcast_last_at', String(Date.now()))
    log('info', 'Telegram broadcast sent', { alerts: batch.length, chats: ok, failed: fail, blocked })
    sending = false
  }

  /** Queue a severe alert; batched into ≤1 broadcast per 30 minutes. */
  function notifyAlert(alert) {
    if (!token()) return // not configured — free no-op
    if ((alert.severity ?? 0) < 2) return
    queue.push(alert)
    if (queue.length > BROADCAST_MAX_QUEUE) queue.shift()
    const last = Number(db.kvGet('telegram_broadcast_last_at') ?? 0)
    schedule(Math.max(5_000, BROADCAST_MIN_GAP_MS - (Date.now() - last)))
  }

  return {
    notifyAlert,
    buildBroadcast,
    configured: () => Boolean(token()),
    status: () => ({
      has_token: Boolean(token()),
      last_push: db.kvGet('telegram_broadcast_last_at'),
      queue_depth: queue.length,
    }),
  }
}
