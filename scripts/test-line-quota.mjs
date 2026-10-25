// Execute the real broadcaster with a fake clock and API. Never sends to LINE.
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../server/line.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/\bexport /g, '')
let passed = 0
function check(name, test) { assert.ok(test, name); passed++; console.log(`PASS ${name}`) }
function harness({ start = '2026-10-26T00:00:00Z', kv, responses = [200] } = {}) {
  let now = Date.parse(start), nextId = 0
  const timers = new Map(), calls = [], logs = [], delays = []
  kv ??= new Map([['line_channel_token', 'test'], ['line_token_minted_at', String(now)]])
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  const context = vm.createContext({
    Date: Clock, AbortSignal, URLSearchParams,
    log: (level, message, extra) => logs.push({ level, message, extra }),
    setInterval: () => ({ unref() {} }),
    setTimeout: (fn, delay) => {
      delays.push(delay)
      assert.ok(delay >= 1 && delay <= 2_147_483_647, `invalid timer: ${delay}`)
      const id = ++nextId; timers.set(id, { at: now + delay, fn }); return id
    },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, opts) => {
      if (url.endsWith('/info')) return { ok: true }
      assert.ok(url.endsWith('/broadcast'), `unexpected request: ${url}`)
      calls.push(JSON.parse(opts.body))
      const response = responses[Math.min(calls.length - 1, responses.length - 1)]
      const status = typeof response === 'number' ? response : response.status
      return { ok: status === 200, status, text: async () => response.body ?? (status === 429 ? 'You have reached your monthly limit.' : 'Temporary failure') }
    },
  })
  vm.runInContext(source, context)
  const line = context.createLine({ kvGet: k => kv.get(k), kvSet: (k, v) => kv.set(k, v) })
  async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve() }
  async function advance(ms) {
    const end = now + ms
    let steps = 0
    while (true) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      assert.ok(++steps < 100, 'timer loop')
      now = due[1].at; timers.delete(due[0]); due[1].fn(); await settle()
    }
    now = end; await settle()
  }
  return { line, kv, calls, logs, delays, advance, now: () => now,
    notify: name => line.notifyAlert({ severity: 3, rule: 'pm25_level', province_en: name, value: 90 }) }
}
{
  const h = harness({ responses: [429] })
  h.notify('old'); await h.advance(5000)
  check('one monthly rejection parks without immediate retry', h.calls.length === 1 && h.line.status().quota_parked)
  check('reset follows Japan accounting timezone', h.line.status().quota_parked_until === '2026-10-31T15:05:00.000Z')
  h.notify('also old'); await h.advance(86_400_000)
  check('fresh arrivals cannot bypass park', h.calls.length === 1)
  const restarted = harness({ kv: h.kv, responses: [200] })
  restarted.notify('after restart'); await restarted.advance(60_000)
  check('persisted park survives process restart', restarted.calls.length === 0 && restarted.line.status().quota_parked)
  await h.advance(Date.parse('2026-10-31T15:05:00Z') - h.now())
  check('quota reset never delivers expired warnings', h.calls.length === 1 && h.line.status().queue_depth === 0)
}
{
  const h = harness({ start: '2026-10-01T00:00:00Z', responses: [429, 200] })
  h.notify('old'); await h.advance(5000)
  check('month-long park chunks timers within Node limit', h.delays.includes(2_147_483_647))
  await h.advance(Date.parse('2026-10-31T15:00:00Z') - h.now())
  h.notify('current'); await h.advance(5 * 60_000)
  check('fresh alert resumes at quota reset', h.calls.length === 2 && !h.line.status().quota_parked)
  const text = h.calls[1].messages[0].text
  check('resumed digest excludes expired episode', text.includes('current') && !text.includes('old'))
}
{
  const h = harness({ start: '2026-12-31T16:00:00Z', responses: [429] })
  h.notify('year'); await h.advance(5000)
  check('Japan month/year rollover is respected', h.line.status().quota_parked_until === '2027-01-31T15:05:00.000Z')
}
{
  // Non-quota failures still use the existing bounded retry path.
  const h = harness({ responses: [503, 503, 200] })
  h.notify('retry'); await h.advance(8000)
  check('transient failure requeues batch', h.calls.length === 2 && h.line.status().queue_depth === 1 && !h.line.status().quota_parked)
  await h.advance(60_000)
  check('transient failure recovers', h.calls.length === 3 && h.line.status().queue_depth === 0)
}

{
  const h = harness({ responses: [{ status: 429, body: 'API rate limit exceeded' }, 200] })
  h.notify('rate limited'); await h.advance(8000)
  check('ordinary 429 retries without monthly parking', h.calls.length === 2 && !h.line.status().quota_parked && h.line.status().queue_depth === 0)
}
{
  const h = harness({ start: '2026-10-31T15:01:00Z', responses: [429] })
  h.notify('rollover'); await h.advance(5000)
  check('rejection during reset grace waits minutes, not another month', h.line.status().quota_parked_until === '2026-10-31T15:05:00.000Z')
}
console.log(`${passed} passed, 0 failed`)
