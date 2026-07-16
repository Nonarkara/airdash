// LINE Official Account alerts — Thailand's default messaging channel.
// Broadcasts severe alerts (severity ≥ 2) to everyone who follows the OA.
//
// Setup (operator, once):
//   1. Create a LINE Official Account + Messaging API channel
//      (developers.line.biz → create provider → Messaging API channel — free).
//   2. Issue a channel access token (long-lived) in the channel settings.
//   3. node scripts/set-line-token.mjs <token>
// Without a token this module is a silent no-op — the dashboard never
// depends on it.
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

export function createLine(db) {
  const token = () => db.kvGet('line_channel_token')
  let queue = []
  let timer = null
  let timerAt = 0                   // absolute ms when the pending timer fires
  let sending = false               // guard: never run two broadcasts at once

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

  async function flush() {
    if (sending) { schedule(RETRY_DELAY_MS); return } // a send is already in flight
    const t = token()
    if (!t || queue.length === 0) return
    // Snapshot the batch OUT of the queue up front. Alerts that arrive during
    // the (up to ~30s) send window then land in a fresh queue and are NOT
    // wiped when this send succeeds — the drop-on-success race in the previous
    // version. On failure we return this exact batch to the front.
    const batch = queue.splice(0)
    sending = true
    const lines = batch.slice(0, MAX_LINES_PER_PUSH).map((a) => `• ${a.message_th}`)
    if (batch.length > MAX_LINES_PER_PUSH) lines.push(`…และอีก ${batch.length - MAX_LINES_PER_PUSH} รายการ`)
    const text = `🌫️ AirDash แจ้งเตือนฝุ่น\n${lines.join('\n')}\n\nดูสด: https://air.nonarkara.org\nโปรดติดตามประกาศ คพ./กรมอุตุฯ · ป้องกันทันที PROTECT NOW`
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
            // Bad token — retrying can't help and holding the batch forever
            // would balloon memory. Drop it loudly.
            log('error', 'LINE auth rejected — dropping batch, fix the token', { status: res.status, dropped: batch.length })
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
    if (!token()) return              // not configured — free no-op
    if ((alert.severity ?? 0) < 2) return
    queue.push(alert)
    if (queue.length > MAX_QUEUE) queue.shift() // drop oldest; keep bounded
    const last = Number(db.kvGet('line_last_push') ?? 0)
    schedule(Math.max(5_000, LINE_MIN_GAP_MS - (Date.now() - last)))
  }

  return { notifyAlert, configured: () => Boolean(token()) }
}
