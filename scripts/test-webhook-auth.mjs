// Regression tests for the webhook authenticity fixes.
// In-memory DB, no network.
//
// WHY THIS FILE EXISTS — read before "simplifying" either webhook.
//
// 1. POST /api/telegram/webhook authenticated NOBODY. The route parsed the
//    body and called processTelegramUpdate directly — no secret token, no
//    HMAC, no rate limit. Anyone who can reach the tunnel can POST a forged
//    update, and a forged /start (or a plain province message) inserts an
//    arbitrary chat_id into telegram_subs — a third party subscribed to
//    alert pushes. During burning season that is a spam channel aimed at
//    people who never asked for it.
//
// 2. POST /api/line/webhook FAILED OPEN when no channel secret was
//    configured: `if (secret && !verifySignature(...))` processed the body
//    whenever the secret was unset. An unauthenticated webhook on a public
//    endpoint that accepts whatever arrives is worse than one that does not
//    work.
//
// Both are the same failure: an endpoint that takes commands from the
// internet must prove who is speaking. These tests pin that contract:
//   - Telegram: 503 while the secret is unprovisioned (fail closed),
//     401 on a mismatched/missing X-Telegram-Bot-Api-Secret-Token,
//     200 only with the registered secret.
//   - LINE: 503 while no line_channel_secret is stored, 401 on a bad
//     signature, and NO DB write before either check.
// If you refactor and these fail, the vulnerability is back — do not
// "fix" the test.
import { openDb } from '../server/db.js'
import { processTelegramUpdate } from '../server/telegramWebhook.js'
import { processLineWebhook } from '../server/lineWebhook.js'
import { timingSafeStrEqual } from '../server/util.js'

const db = openDb(':memory:')

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

// A forged Telegram update that would subscribe an arbitrary chat_id.
const forgedUpdate = () => ({
  update_id: 999_999_001,
  message: {
    chat: { id: 424_242_424 },
    from: { username: 'attacker', first_name: 'Attacker' },
    text: 'เชียงใหม่',
    date: Math.floor(Date.now() / 1000),
  },
})

// A minimal stub DB for the auth paths: auth must answer from kvGet alone,
// BEFORE any table read/write — that is the contract ("auth first"), and
// this stub proves it: any db.get/run call would throw.
const authOnlyDb = () => ({
  kv: new Map([['telegram_webhook_secret', 'k3tQ8x2mPw7nRv5sJh1dYb4gZf6cL0aT']]),
  kvGet(k) { return this.kv.get(k) ?? null },
  kvSet(k, v) { this.kv.set(k, v) },
  get() { throw new Error('db.get called before auth passed') },
  run() { throw new Error('db.run called before auth passed') },
  exec() { throw new Error('db.exec called before auth passed') },
})

// ── 1. Telegram: fail closed while the secret is unprovisioned ───────────
{
  const dbNoSecret = { kvGet: () => null }
  const out = await processTelegramUpdate(dbNoSecret, forgedUpdate(), undefined)
  check('telegram: no secret provisioned → 503 (fail closed)', out?.status === 503, JSON.stringify(out))
  const outForged = await processTelegramUpdate(dbNoSecret, forgedUpdate(), 'anything-goes')
  check('telegram: no secret provisioned → 503 even with a header', outForged?.status === 503, JSON.stringify(outForged))
}

// ── 2. Telegram: 401 on a forged body, never a 200 ────────────────────────
{
  const out = await processTelegramUpdate(authOnlyDb(), forgedUpdate(), 'wrong-secret')
  check('telegram: mismatched secret → 401', out?.status === 401, JSON.stringify(out))
  const outNoHeader = await processTelegramUpdate(authOnlyDb(), forgedUpdate(), undefined)
  check('telegram: missing secret header → 401', outNoHeader?.status === 401, JSON.stringify(outNoHeader))
}

// ── 3. Telegram: auth passes → route may proceed (benign no-op 200) ───────
{
  // The stub throws if the trusted path touches storage, so a 200 here
  // proves auth answered from kv alone; handleTrustedUpdate returning false
  // (undefined update) maps to the benign { ok: true, processed: 0 }.
  const out = await processTelegramUpdate(authOnlyDb(), undefined, 'k3tQ8x2mPw7nRv5sJh1dYb4gZf6cL0aT')
  check('telegram: registered secret → 200', out?.status === 200 && out?.ok === true, JSON.stringify(out))
  check('telegram: benign no-op reports processed: 0', out?.processed === 0, JSON.stringify(out))
}

// ── 4. LINE: fail closed while no channel secret is stored ────────────────
{
  const dbNoSecret = { kvGet: () => null }
  const out = await processLineWebhook(dbNoSecret, '{"events":[]}', 'sig')
  check('line: no channel secret → 503 (fail closed, was fail open)', out?.status === 503, JSON.stringify(out))
  const outNoSig = await processLineWebhook(dbNoSecret, '{"events":[]}', undefined)
  check('line: no channel secret → 503 even with no signature', outNoSig?.status === 503, JSON.stringify(outNoSig))
}

// ── 5. LINE: 401 on a bad signature, never a 200 ──────────────────────────
{
  const dbWithSecret = { kvGet: (k) => (k === 'line_channel_secret' ? 'channel-secret-0123456789abcdef' : null) }
  const out = await processLineWebhook(dbWithSecret, '{"events":[]}', 'AAAA')
  check('line: bad signature → 401', out?.status === 401, JSON.stringify(out))
  const outNoSig = await processLineWebhook(dbWithSecret, '{"events":[]}', undefined)
  check('line: missing signature header → 401', outNoSig?.status === 401, JSON.stringify(outNoSig))
}

// ── 6. LINE: a VALID signature is accepted, and only then touches storage ─
{
  // Real secret + matching HMAC. The body has no events, so the 200 path
  // stops before ensureReportsTable — proving the accepted path answers
  // without storage writes for an empty delivery.
  const { createHmac } = await import('node:crypto')
  const secret = 'channel-secret-0123456789abcdef'
  const body = '{"events":[]}'
  const sig = createHmac('sha256', secret).update(body).digest('base64')
  const dbWithSecret = {
    kvGet: (k) => (k === 'line_channel_secret' ? secret : null),
    exec() { throw new Error('db.exec called before auth passed') },
  }
  const out = await processLineWebhook(dbWithSecret, body, sig)
  check('line: valid HMAC → 200', out?.status === 200 && out?.ok === true, JSON.stringify(out))
}

// ── 7. The route wires the header through and maps the failure codes ──────
{
  const api = (await import('node:fs')).readFileSync(new URL('../server/api.js', import.meta.url), 'utf8')
  check('route passes x-telegram-bot-api-secret-token to the module',
    api.includes("req.headers['x-telegram-bot-api-secret-token']"))
  check('telegram route maps 401 to a 401 response', /status === 401[\s\S]{0,80}json\(res, 401/.test(api))
  check('telegram route maps 503 to a 503 response', /status === 503[\s\S]{0,80}json\(res, 503/.test(api))
  check('line route maps 503 to a 503 response', /line channel secret not configured/.test(api))
  check('admin GET exposes has_webhook_secret (boolean, never the secret)',
    api.includes('has_webhook_secret: Boolean(db.kvGet'))
}

// ── 8. registerWebhook sends secret_token (source-level, no network) ──────
{
  const tg = (await import('node:fs')).readFileSync(new URL('../server/telegram.js', import.meta.url), 'utf8')
  check('registerWebhook generates + stores telegram_webhook_secret when missing',
    /kvGet\('telegram_webhook_secret'\)[\s\S]{0,300}kvSet\('telegram_webhook_secret'/.test(tg))
  check('setWebhook body carries secret_token', /secret_token:\s*secret/.test(tg))
  check('the generated secret uses Telegram-allowed characters (base64url)',
    /base64url/.test(tg))
}

// ── 9. timingSafeStrEqual is timing-safe-shaped and single-sourced ────────
check('length mismatch → false, no throw', timingSafeStrEqual('a', 'abcdef') === false)
check('equal strings → true', timingSafeStrEqual('secret', 'secret') === true)
check('null/undefined → false, no throw', timingSafeStrEqual(null, 'x') === false)
{
  const line = (await import('node:fs')).readFileSync(new URL('../server/lineWebhook.js', import.meta.url), 'utf8')
  check('lineWebhook.js imports the shared primitive (no local copy)',
    /import \{[^}]*timingSafeStrEqual[^}]*\} from '\.\/util\.js'/.test(line) &&
    !/function timingSafeStrEqual/.test(line))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
