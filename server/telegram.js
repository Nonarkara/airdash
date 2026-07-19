// Telegram Bot API wrapper — second push channel so the LINE free-tier
// 300 messages/month cap doesn't choke us during a haze season. Telegram
// bot tokens are permanent (no rotation like LINE's 30d tokens), so this
// module is much simpler than server/line.js — no mint, no canPush, just
// a thin sendMessage helper with rate-limit + retry on 429.
//
// Setup (operator, once):
//   1. Create a bot via @BotFather, save the token.
//   2. node scripts/set-telegram-token.mjs <token>
//      (also sets the bot's command list and webhook URL)
//   3. Citizen flow is fully on the bot:
//      - User taps t.me/AirDash_bot?start=<binding_code>
//      - Bot receives /start <code> via webhook, stores chat_id + code
//      - Citizen picks province/language in the dashboard
//      - The binding_code ties their chat to their AirDash session
//
// Without a token this module is a silent no-op. The dashboard never
// depends on Telegram — the LINE OA + per-token paths still work.
import { log } from './util.js'

const TELEGRAM_API = 'https://api.telegram.org'
const FETCH_TIMEOUT_MS = 10_000

// Telegram is much more generous than LINE on rate limits but per-chat
// concurrency is still capped. A spread of 35 msgs/s/chat is the published
// limit; we back off aggressively on 429 to stay well under it.
const RETRY_AFTER_DEFAULT_MS = 1_000

// canPush probe cache: don't hammer getMe on every alert. Cache the
// "this token works" answer for 30 min; a 401 immediately invalidates
// the cache and goes dormant.
const PROBE_TTL_MS = 30 * 60_000

export function createTelegram(db) {
  const token = () => db.kvGet('telegram_bot_token')
  let probe = { at: 0, ok: false, info: null }

  // Lightweight liveness probe. Returns the bot info object on success
  // (so the admin panel can show "bot @AirDash_bot connected"), or null
  // on any failure. Cached.
  async function canPush() {
    const t = token()
    if (!t) return null
    if (Date.now() - probe.at < PROBE_TTL_MS) return probe.ok ? probe.info : null
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${t}/getMe`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        probe = { at: Date.now(), ok: false, info: null }
        log('warn', 'Telegram getMe failed', { status: res.status })
        return null
      }
      const j = await res.json()
      if (!j.ok) {
        probe = { at: Date.now(), ok: false, info: null }
        return null
      }
      probe = { at: Date.now(), ok: true, info: j.result }
      return probe.info
    } catch (err) {
      log('warn', 'Telegram getMe error', { error: String(err?.message ?? err) })
      return probe.ok ? probe.info : null
    }
  }

  // Low-level sendMessage. Throws on non-2xx so callers (the push module)
  // can decide whether to bump fail_count + auto-purge. Honors 429
  // Retry-After so a hot chat doesn't 429-loop.
  async function sendMessage(chatId, text, { parseMode = 'HTML', disableWebPagePreview = true } = {}) {
    const t = token()
    if (!t) throw new Error('telegram bot token not configured')
    const body = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: disableWebPagePreview,
    }
    let attempt = 0
    while (attempt < 2) {
      try {
        const res = await fetch(`${TELEGRAM_API}/bot${t}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (res.ok) return await res.json().catch(() => ({}))
        const text = (await res.text()).slice(0, 300)
        // 429 — rate-limited. Honor Retry-After; retry once.
        if (res.status === 429) {
          const data = JSON.parse(text)
          const wait = (data?.parameters?.retry_after ?? 1) * 1000
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, Math.min(wait, 5000)))
            attempt++
            continue
          }
          const err = new Error(`Telegram 429: ${text}`)
          err.status = 429
          throw err
        }
        // 401/403 — bad token or bot was kicked from a chat. 403 on a
        // specific chat is "user blocked the bot" — caller will purge.
        if (res.status === 401 || res.status === 403) {
          // Bot-wide auth failure (401) — invalidate the probe so future
          // calls stop. Per-chat 403 (blocked) we let the caller handle.
          if (res.status === 401) probe = { at: 0, ok: false, info: null }
          const err = new Error(`Telegram ${res.status}: ${text}`)
          err.status = res.status
          throw err
        }
        const err = new Error(`Telegram ${res.status}: ${text}`)
        err.status = res.status
        throw err
      } catch (err) {
        if (attempt > 0) throw err
        attempt++
      }
    }
    throw new Error('Telegram sendMessage: exhausted retries')
  }

  // Register the webhook URL with Telegram. Idempotent — re-running with
  // the same URL is a no-op. We always re-call setMyCommands too because
  // the operator might rotate the bot and lose the custom command list.
  async function registerWebhook(webhookUrl) {
    const t = token()
    if (!t) throw new Error('telegram bot token not configured')
    // deleteWebhook first so a re-registration doesn't 409 on a stale
    // pending update queue.
    await fetch(`${TELEGRAM_API}/bot${t}/deleteWebhook?drop_pending_updates=true`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => {})
    const res = await fetch(`${TELEGRAM_API}/bot${t}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      throw new Error(`setWebhook ${res.status}: ${text}`)
    }
    return await res.json().catch(() => ({}))
  }

  async function setCommands(commands) {
    const t = token()
    if (!t) return
    await fetch(`${TELEGRAM_API}/bot${t}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => {})
  }

  return {
    canPush,
    sendMessage,
    registerWebhook,
    setCommands,
    configured: () => Boolean(token()),
    status: () => ({
      has_token: Boolean(token()),
      bot: probe.info ? { username: probe.info.username, first_name: probe.info.first_name, id: probe.info.id } : null,
      probe_ok: probe.ok,
      probe_age_s: probe.at ? Math.round((Date.now() - probe.at) / 1000) : null,
    }),
  }
}
