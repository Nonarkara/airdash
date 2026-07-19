// Telegram webhook — inbound citizen interactions with the AirDash bot
// (@AirDash_bot). Receives every /start, /stop, /status, /province,
// /language, /help message; routes them to the right handler; updates
// telegram_subs accordingly.
//
// Setup: this module reads the SAME kv key server/telegram.js already
// writes (telegram_bot_token) — no separate config needed. The webhook
// endpoint URL itself is registered with Telegram via
//   setWebhook("https://api-air.nonarkara.org/api/telegram/webhook")
// (done in scripts/set-telegram-token.mjs). Telegram has its own
// 1-second-event-arrival timeout; the handler does only cheap work
// inline and fire-and-forgets the rest.
//
// Privacy: chat_id is the only PII we store. The user's @handle and
// first_name are captured at /start time for the welcome message and
// admin display, but they're never sent to a third party.
import { log } from './util.js'
import { createTelegram } from './telegram.js'

// Bot commands — the /start welcome is intentionally brief (Telegram
// caps the response at 4096 chars; we stay well under).
const STRINGS = {
  th: {
    welcome: (code) => code
      ? `สวัสดีค่ะ 👋 Air คือบอทแจ้งเตือนฝุ่น PM2.5 ของ AirDash\n\n` +
        `กำลังเชื่อมต่อกับรหัส <code>${code}</code>...`
      : `สวัสดีค่ะ 👋 Air คือบอทแจ้งเตือนฝุ่น PM2.5 ของ AirDash\n\n` +
        `หากต้องการรับการแจ้งเตือน ให้เปิด AirDash → เลือกโหมดง่าย → เลือกจังหวัด → กดปุ่ม "เชื่อมต่อ Telegram"\n` +
        `https://air.nonarkara.org`,
    bound: (province) => `✅ เชื่อมต่อสำเร็จ — จะแจ้งเตือนเมื่อฝุ่นใน${province}ถึงขั้นต้องป้องกัน\n\n` +
      `สั่ง /stop เมื่อต้องการยกเลิก`,
    stopped: 'หยุดการแจ้งเตือนแล้ว — หากต้องการกลับมาใช้อีก พิมพ์ /start',
    notBound: 'คุณยังไม่ได้เชื่อมต่อจังหวัด — กลับไปที่ AirDash เพื่อเริ่มต้น:\nhttps://air.nonarkara.org',
    statusActive: (province, lang) => `สถานะ: เปิดใช้งาน\nจังหวัด: ${province}\nภาษา: ${lang === 'en' ? 'English' : 'ไทย'}`,
    statusInactive: 'สถานะ: ปิดใช้งาน (กด /start เพื่อเปิดใหม่)',
    langSet: (lang) => `เปลี่ยนภาษาเป็น ${lang === 'en' ? 'English' : 'ไทย'} แล้ว`,
    langUsage: 'ใช้: /language th หรือ /language en',
    provinceSet: (p) => `เปลี่ยนจังหวัดเป็น ${p} แล้ว`,
    provinceUsage: 'ใช้: /province <ชื่อจังหวัด เช่น /province เชียงใหม่>',
    provinceUnknown: 'ไม่พบจังหวัดนี้ — ลองพิมพ์ /province เชียงใหม่ หรือ /province Chiang Mai',
    help: 'คำสั่งที่ใช้ได้:\n' +
      '/start — เริ่มใช้งาน\n' +
      '/stop — ยกเลิกการแจ้งเตือน\n' +
      '/status — ดูสถานะปัจจุบัน\n' +
      '/province <ชื่อ> — เปลี่ยนจังหวัด\n' +
      '/language th|en — เปลี่ยนภาษา\n' +
      '/help — แสดงคำสั่งทั้งหมด',
  },
  en: {
    welcome: (code) => code
      ? `Hi 👋 I'm Air, the AirDash PM2.5 alert bot\n\n` +
        `Linking with code <code>${code}</code>...`
      : `Hi 👋 I'm Air, the AirDash PM2.5 alert bot\n\n` +
        `To subscribe, open AirDash → EASY mode → pick your province → tap "Connect on Telegram"\n` +
        `https://air.nonarkara.org`,
    bound: (province) => `✅ Linked — you'll get an alert when PM2.5 in ${province} hits protect-now level\n\n` +
      `Send /stop anytime to unsubscribe`,
    stopped: 'Alerts stopped — send /start to subscribe again',
    notBound: 'No province linked yet — open AirDash to get started:\nhttps://air.nonarkara.org',
    statusActive: (province, lang) => `Status: active\nProvince: ${province}\nLanguage: ${lang === 'en' ? 'English' : 'ไทย'}`,
    statusInactive: 'Status: inactive (send /start to re-activate)',
    langSet: (lang) => `Language set to ${lang === 'en' ? 'English' : 'ไทย'}`,
    langUsage: 'Usage: /language th or /language en',
    provinceSet: (p) => `Province changed to ${p}`,
    provinceUsage: 'Usage: /province <name, e.g. /province Chiang Mai>',
    provinceUnknown: 'Province not found — try /province Chiang Mai or /province เชียงใหม่',
    help: 'Commands:\n' +
      '/start — get started\n' +
      '/stop — unsubscribe\n' +
      '/status — current status\n' +
      '/province <name> — change province\n' +
      '/language th|en — switch language\n' +
      '/help — show this list',
  },
}

// Province name → {th, en, code} lookup. The webhook gets free-text
// from /province and we need to resolve it to a province the rest of
// the system understands. Loaded lazily from the same risk snapshot
// the rest of the dashboard reads so it's never out of date with what
// the user sees in the UI.
let _provinceIndex = null
async function loadProvinceIndex(db) {
  if (_provinceIndex) return _provinceIndex
  const cached = db.kvGet('risk_provinces')
  if (!cached) return []
  try {
    const arr = JSON.parse(cached)
    _provinceIndex = arr.map((p) => ({ th: p.province_th, en: p.province_en, code: p.province_code }))
    return _provinceIndex
  } catch {
    return []
  }
}
function resetProvinceIndex() { _provinceIndex = null }

function norm(s) { return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '') }
function resolveProvince(list, q) {
  if (!q) return null
  const nq = norm(q)
  let m = list.find((p) => norm(p.th) === nq || norm(p.en) === nq)
  if (m) return m
  m = list.find((p) => norm(p.th).includes(nq) || norm(p.en).includes(nq))
  return m ?? null
}

// Process a single Telegram Update. Returns true if the update was
// handled (or an async response was scheduled). Telegram sends one
// update per message; we respond with the answer text immediately.
export async function processTelegramUpdate(db, update) {
  if (!update || update.update_id === undefined) return false
  const tg = createTelegram(db)
  if (!tg.configured()) return false // no token yet — silent no-op
  const msg = update.message
  if (!msg) return false
  const chat = msg.chat
  if (!chat?.id) return false
  const chatId = chat.id
  const text = (msg.text ?? '').trim()
  if (!text.startsWith('/')) return false // ignore non-command messages

  // /start [code] — the only path into a binding.
  if (text === '/start' || text.startsWith('/start ')) {
    const code = text === '/start' ? null : text.slice(7).trim().split(/\s+/)[0]?.toUpperCase() || null
    // Persist chat_id + handle + first_name first; the user might
    // /start the bot BEFORE visiting the dashboard (common — they
    // discover the bot in a forwarded link).
    const handle = msg.from?.username ?? null
    const firstName = msg.from?.first_name ?? null
    const now = new Date().toISOString()
    const existing = db.get('SELECT id, lang, binding_code FROM telegram_subs WHERE chat_id = ?', chatId)
    if (existing) {
      db.run(`UPDATE telegram_subs SET binding_code = ?, user_handle = COALESCE(?, user_handle),
              first_name = COALESCE(?, first_name), updated_at = ? WHERE id = ?`,
        code, handle, firstName, now, existing.id)
    } else {
      db.run(`INSERT INTO telegram_subs (chat_id, binding_code, user_handle, first_name, lang, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'th', ?, ?)`,
        chatId, code, handle, firstName, now, now)
    }
    if (code) {
      // If the dashboard has already called bindChat with the same code,
      // telegram_subs has province_th set. Confirm and notify.
      const row = db.get('SELECT province_th, lang FROM telegram_subs WHERE chat_id = ?', chatId)
      if (row?.province_th) {
        const s = STRINGS[row.lang || 'th']
        await tg.sendMessage(chatId, s.bound(row.province_th)).catch(() => {})
        return true
      }
      // Otherwise the user is on a fresh /start <code> — acknowledge
      // and tell them the binding is staged.
      const s = STRINGS[existing?.lang || 'th']
      await tg.sendMessage(chatId, s.welcome(code)).catch(() => {})
      return true
    }
    // /start with no code — generic welcome.
    const s = STRINGS[existing?.lang || 'th']
    await tg.sendMessage(chatId, s.welcome(null)).catch(() => {})
    return true
  }

  // From here down, only meaningful for already-bound chats.
  const sub = db.get('SELECT id, lang, province_th, province_en, province_code, active FROM telegram_subs WHERE chat_id = ?', chatId)
  if (!sub) {
    const s = STRINGS.th
    await tg.sendMessage(chatId, s.notBound).catch(() => {})
    return true
  }
  const lang = sub.lang || 'th'
  const s = STRINGS[lang]

  if (text === '/stop' || text.startsWith('/stop ')) {
    db.run(`UPDATE telegram_subs SET active = 0, updated_at = datetime('now') WHERE id = ?`, sub.id)
    await tg.sendMessage(chatId, s.stopped).catch(() => {})
    return true
  }

  if (text === '/status') {
    if (!sub.active || !sub.province_th) {
      await tg.sendMessage(chatId, s.statusInactive).catch(() => {})
    } else {
      await tg.sendMessage(chatId, s.statusActive(sub.province_th, lang)).catch(() => {})
    }
    return true
  }

  if (text === '/language' || text.startsWith('/language ')) {
    const arg = text === '/language' ? '' : text.slice(10).trim().toLowerCase()
    if (arg !== 'th' && arg !== 'en') {
      await tg.sendMessage(chatId, s.langUsage).catch(() => {})
      return true
    }
    db.run(`UPDATE telegram_subs SET lang = ?, updated_at = datetime('now') WHERE id = ?`, arg, sub.id)
    await tg.sendMessage(chatId, STRINGS[arg].langSet(arg)).catch(() => {})
    return true
  }

  if (text === '/province' || text.startsWith('/province ')) {
    const arg = text === '/province' ? '' : text.slice(10).trim()
    if (!arg) {
      await tg.sendMessage(chatId, s.provinceUsage).catch(() => {})
      return true
    }
    const list = await loadProvinceIndex(db)
    const m = resolveProvince(list, arg)
    if (!m) {
      await tg.sendMessage(chatId, s.provinceUnknown).catch(() => {})
      return true
    }
    db.run(`UPDATE telegram_subs SET province_th = ?, province_en = ?, province_code = ?,
            active = 1, updated_at = datetime('now') WHERE id = ?`,
      m.th, m.en, m.code, sub.id)
    await tg.sendMessage(chatId, s.provinceSet(lang === 'en' ? m.en : m.th)).catch(() => {})
    return true
  }

  if (text === '/help' || text === '/start@AirDash_bot') {
    await tg.sendMessage(chatId, s.help).catch(() => {})
    return true
  }

  // Unknown command — surface the help so the user knows the available list.
  await tg.sendMessage(chatId, s.help).catch(() => {})
  return true
}

// Reset the cached province index when the risk snapshot changes so
// /province always sees fresh data.
export function _resetProvinceIndex() { resetProvinceIndex() }
