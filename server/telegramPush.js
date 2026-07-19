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
export function bindChat(db, { chatId, province_th, province_en, province_code, lang }) {
  if (!Number.isFinite(chatId)) throw new Error('chatId required')
  if (!province_th) throw new Error('province_th required')
  const now = new Date().toISOString()
  const existing = db.get('SELECT id FROM telegram_subs WHERE chat_id = ?', chatId)
  if (existing) {
    db.run(`UPDATE telegram_subs SET province_th = ?, province_en = ?, province_code = ?,
            lang = ?, binding_code = NULL, fail_count = 0, active = 1, updated_at = ?
            WHERE id = ?`,
      province_th, province_en ?? null, province_code ?? null, lang ?? 'th', now, existing.id)
    return { ok: true, updated: true }
  }
  // Chat arrived via /start first, so an INSERT here is the fallback
  // for the case where the dashboard calls bindChat before the webhook
  // has fired (race). binding_code is nullable; the webhook will fill
  // it in.
  db.run(`INSERT INTO telegram_subs (chat_id, binding_code, province_th, province_en, province_code, lang, created_at, updated_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    chatId, province_th, province_en ?? null, province_code ?? null, lang ?? 'th', now, now)
  return { ok: true, created: true }
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
      // repeated rate-limit. Purge so the next tick doesn't waste sends.
      if (err.status === 401 || err.status === 403 || newCount >= MAX_FAIL_COUNT) {
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
// `alert` is { province_th, province_en, province_code, severity, message_th, message_en }.
export async function notifySubscribersForAlert(db, alert) {
  if (!alert || (alert.severity ?? 0) < 2) return { pushed: 0, failed: 0 }
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
    PER_SUB_GAP_MS,
    alert.province_code ?? '',
    alert.province_th ?? '',
    alert.province_en ?? '',
  )
  if (!subs.length) return { pushed: 0, failed: 0 }

  const tg = createTelegram(db)
  let pushed = 0, failed = 0
  for (const sub of subs) {
    const text = buildMessage(
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
      if (err.status === 401 || err.status === 403 || newCount >= MAX_FAIL_COUNT) {
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
