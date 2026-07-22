// LINE per-token push notifications — citizens who paste a LINE Notify
// token (issued at https://notify-bot.line.me after adding the bot as a
// friend) so the server can deliver severe PM2.5 / AQI alerts to ONE user
// at a time. The OA-broadcast path (server/line.js) is a different channel
// and never touches this table.
//
// Why a separate module from server/line.js:
//   - line.js: OA broadcast (one push reaches every OA follower, no per-user
//     targeting, free but coarse).
//   - linePush.js: per-user targeting via LINE Notify. A user pastes a token,
//     we send a single targeted push only when THEIR province crosses the
//     danger threshold. Throttled, opt-in, opt-out, and addressable.
//
// What this module exports:
//   - tickLinePush(db)       → cron-callable, walks the latest risk snapshot
//                              and pushes to subscribers whose province is in
//                              danger. Returns {pushed, failed, scanned}.
//   - buildMessage(province_th, province_en, band, score, lang) → string,
//                              used by /api/line/preview so the UI can show
//                              the user exactly what they'll receive.
//   - sendLineNotify(token, message) → low-level one-shot send (used to
//                              validate a token at subscribe time).
//   - notifySubscribersForAlert(alert) → wires the alert engine's fan-out
//                              so severe alerts (sev ≥ 2) reach the right
//                              subscribers without an extra cron wait.
//
// Citizen flow:
//   1. Visit notify-bot.line.me → log in → "Generate token" → copy.
//   2. In the citizen panel: paste token, pick province, pick language.
//   3. /api/line/subscribe  → we send a tiny "✅ connected" test message
//      via LINE Notify. If LINE accepts, the sub is stored.
//   4. From then on, any sev-2+ alert for the user's province → push.
//   5. The push message includes a one-line "ยกเลิก · cancel" link so
//      users can self-unsubscribe without filling a form.
import { log } from './util.js'

const NOTIFY_API = 'https://notify-api.line.me/api/notify'
const FETCH_TIMEOUT_MS = 10_000

// Self-throttle: a single subscriber (token, province) gets AT MOST one
// push per this window. Without it, a haze episode that fires 6 alerts in
// 20 min for the same province would deliver 6 pushes to the same person.
// 3 h is the same window FloodDash uses — long enough to silence duplicate
// storms, short enough that a fresh spike hours later still gets through.
const PER_SUB_GAP_MS = 3 * 60 * 60_000

// Fail-count cap. A token that returns 401 (revoked) or persistent 5xx
// gets purged after this many consecutive failures so the table doesn't
// fill with dead tokens. Reset to 0 on any successful push.
const MAX_FAIL_COUNT = 5

// Map a risk band to a LINE Notify emoji + headline. The same severity
// table feeds the top-bar danger chip and the citizen mode panel — this
// is the LINE-side mirror so a push feels consistent with the UI.
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
// so the citizen panel can show "this is what you'll get" in /api/line/preview.
// `lang` is 'th' | 'en' (defaults to 'th'). The cancel link is appended in
// the same language so the user always knows how to stop pushes.
export function buildMessage(province_th, province_en, band, score, lang = 'th') {
  const safeBand = BAND_HEADLINE[lang]?.[band] ? band : 'watch'
  const head = BAND_HEADLINE[lang][safeBand]
  const pTh = province_th || (lang === 'en' ? 'Thailand' : 'ประเทศไทย')
  const pEn = province_en || pTh
  const display = lang === 'en' ? pEn : pTh
  const cancelLine = lang === 'en'
    ? 'ยกเลิกการแจ้งเตือน: https://air.nonarkara.org/?linecancel=1'
    : 'Cancel alerts: https://air.nonarkara.org/?linecancel=1'
  const live = lang === 'en' ? 'Live: https://air.nonarkara.org' : 'ดูสด: https://air.nonarkara.org'
  return (
    `${head.verb} · ${head.emoji}\n` +
    `${lang === 'en' ? 'Province' : 'จังหวัด'}: ${display}\n` +
    `Air Watch Score: ${score}/100\n` +
    `${head.action}\n\n` +
    `${live}\n` +
    (lang === 'en'
      ? '1650 pollution · 1422 DDC health · 1669 EMS\n'
      : 'สายด่วน 1650 มลพิษ · 1422 สธ. · 1669 ฉุกเฉิน\n') +
    cancelLine
  )
}

// Reassuring all-clear message — mirror of telegramPush.buildAllClearMessage
// for the (now EOL, 2025-03-31) Notify per-token path. Kept so the module's
// alert fan-out stays semantically correct if a successor channel reuses it.
export function buildAllClearMessage(province_th, province_en, lang = 'th') {
  const pTh = province_th || (lang === 'en' ? 'Thailand' : 'ประเทศไทย')
  const pEn = province_en || pTh
  const display = lang === 'en' ? pEn : pTh
  const body = lang === 'en'
    ? 'PM2.5 is back below 25 µg/m³ and holding — the air has cleared. Safe to go out and enjoy the day.'
    : 'PM2.5 ลดลงต่ำกว่า 25 µg/m³ ต่อเนื่องแล้ว — อากาศดีขึ้นแล้ว ออกไปข้างนอก ใช้ชีวิตได้ตามปกติ'
  const live = lang === 'en' ? 'Live: https://air.nonarkara.org' : 'ดูสด: https://air.nonarkara.org'
  return (
    `${lang === 'en' ? '✅ Air has cleared' : '✅ อากาศดีขึ้นแล้ว'}\n` +
    `${lang === 'en' ? 'Province' : 'จังหวัด'}: ${display}\n` +
    `${body}\n\n` +
    `${live}`
  )
}

// One-shot LINE Notify send. Throws on non-2xx so the subscribe handler
// can decide what to tell the user; alert fan-out wraps it in try/catch
// and converts to a fail_count bump.
export async function sendLineNotify(token, message) {
  if (!token || typeof token !== 'string') throw new Error('token required')
  const body = new URLSearchParams({ message }).toString()
  const res = await fetch(NOTIFY_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'authorization': `Bearer ${token}`,
      'user-agent': 'AirDash/1.0 (local air-quality monitoring)',
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200)
    // 401/403/410: the user revoked the token or the LINE account is
    // gone. Treat as a permanent failure — the caller (subscribe) should
    // surface the same error string; alert fan-out bumps fail_count and
    // auto-purges on MAX_FAIL_COUNT.
    const err = new Error(`LINE Notify ${res.status}: ${text}`)
    err.status = res.status
    throw err
  }
  return res.json().catch(() => ({}))
}

// Cron entry point — called by server/index.js every 5 min. Walks the
// latest risk snapshot (or, if not yet built, reads the most recent
// province band per the daily rollup) and pushes to any active subscriber
// whose province is in 'elevated' or 'high' AND who hasn't been notified
// for that province in PER_SUB_GAP_MS. Cheap: the sub table is at most
// a few thousand rows; the gap check is one indexed column.
export async function tickLinePush(db) {
  const subs = db.all(
    `SELECT id, token, province_th, province_en, province_code, lang, last_notified_at
     FROM line_subs
     WHERE active = 1
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

  let pushed = 0, failed = 0
  for (const sub of subs) {
    const live =
      (sub.province_code && bandByCode.get(String(sub.province_code))) ||
      (sub.province_th && bandByName.get(sub.province_th)) ||
      (sub.province_en && bandByName.get(sub.province_en.toLowerCase()))
    if (!live) continue
    if (live.band !== 'elevated' && live.band !== 'high') continue
    const msg = buildMessage(sub.province_th, sub.province_en, live.band, live.score ?? 0, sub.lang || 'th')
    try {
      await sendLineNotify(sub.token, msg)
      db.run(`UPDATE line_subs SET last_notified_at = datetime('now'), fail_count = 0, updated_at = datetime('now') WHERE id = ?`, sub.id)
      pushed++
    } catch (err) {
      failed++
      const newCount = (sub.fail_count ?? 0) + 1
      // Permanent failure (token revoked): purge immediately so the next
      // tick doesn't waste a send on the same dead token.
      if (err.status === 401 || err.status === 403 || err.status === 410 || newCount >= MAX_FAIL_COUNT) {
        db.run(`DELETE FROM line_subs WHERE id = ?`, sub.id)
        log('warn', 'line-push subscriber purged', { id: sub.id, status: err.status, fail_count: newCount })
      } else {
        db.run(`UPDATE line_subs SET fail_count = ?, updated_at = datetime('now') WHERE id = ?`, newCount, sub.id)
      }
      log('warn', 'line-push send failed', { id: sub.id, status: err.status, error: String(err?.message ?? err) })
    }
  }
  return { pushed, failed, scanned: subs.length }
}

// Fan-out from the alert engine. When alerts.js fires a sev-2+ alert we
// also want every active subscriber for that province to get a push NOW
// (not wait up to 5 min for the next tick). The cron tick is still
// authoritative — this is the fast path so a fresh spike feels instant.
// All-clear alerts (rule pm25_all_clear) ride the same path with their own
// reassuring template and ignore the 3 h per-sub gap (their own 12 h
// cooldown is the spam guard).
// `alert` is { province_th, province_en, province_code, severity, rule, message_th, message_en }.
export async function notifySubscribersForAlert(db, alert) {
  const isAllClear = alert?.rule === 'pm25_all_clear'
  if (!alert || (!isAllClear && (alert.severity ?? 0) < 2)) return { pushed: 0, failed: 0 }
  if (!alert.province_th && !alert.province_en && !alert.province_code) {
    return { pushed: 0, failed: 0 }
  }
  // Match by code first (exact), then by name (Thai + English). The
  // name match is case-insensitive on English to absorb capitalization
  // differences between alert producers.
  const subs = db.all(
    `SELECT id, token, province_th, province_en, lang, last_notified_at
     FROM line_subs
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

  let pushed = 0, failed = 0
  for (const sub of subs) {
    const msg = isAllClear
      ? buildAllClearMessage(alert.province_th ?? sub.province_th, alert.province_en ?? sub.province_en, sub.lang || 'th')
      : buildMessage(
        alert.province_th ?? sub.province_th,
        alert.province_en ?? sub.province_en,
        alert.severity >= 3 ? 'high' : 'elevated',
        alert.severity >= 3 ? 80 : 60,
        sub.lang || 'th',
      )
    try {
      await sendLineNotify(sub.token, msg)
      db.run(`UPDATE line_subs SET last_notified_at = datetime('now'), fail_count = 0, updated_at = datetime('now') WHERE id = ?`, sub.id)
      pushed++
    } catch (err) {
      failed++
      const newCount = (sub.fail_count ?? 0) + 1
      if (err.status === 401 || err.status === 403 || err.status === 410 || newCount >= MAX_FAIL_COUNT) {
        db.run(`DELETE FROM line_subs WHERE id = ?`, sub.id)
        log('warn', 'line-push subscriber purged (alert)', { id: sub.id, status: err.status })
      } else {
        db.run(`UPDATE line_subs SET fail_count = ?, updated_at = datetime('now') WHERE id = ?`, newCount, sub.id)
      }
      log('warn', 'line-push alert send failed', { id: sub.id, status: err.status, error: String(err?.message ?? err) })
    }
  }
  return { pushed, failed }
}
