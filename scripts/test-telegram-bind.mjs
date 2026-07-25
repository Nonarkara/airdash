// Regression tests for the Telegram binding authorization fix.
// In-memory DB, no network.
//
// WHY THIS FILE EXISTS — read before "simplifying" bindChat().
// POST /api/telegram/bind used to accept an arbitrary chat_id with no
// proof of ownership. bindChat() would then UPDATE whatever row matched,
// so an unauthenticated caller could silently re-point an existing
// subscriber's dust alerts at a different province. During burning season
// that means a Chiang Mai subscriber receiving "air is fine" pushes for a
// clean province while their own air is hazardous — a life-safety
// integrity failure, not merely a privacy one. It also allowed enrolling
// arbitrary chats, risking a bot ban.
//
// The binding code is now the credential. These tests pin that contract:
// a bind MUST present a code that belongs to that exact chat, and the
// code MUST be single-use. If you refactor bindChat and these fail, the
// vulnerability is back — do not "fix" the test.
import { openDb } from '/Users/axiom/AirDash/server/db.js'
import { bindChat, generateBindingCode } from '/Users/axiom/AirDash/server/telegramPush.js'

const db = openDb(':memory:')
const now = new Date().toISOString()

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }
/** bindChat throws on refusal — treat a throw as "refused". */
const refused = (fn) => { try { fn(); return false } catch { return true } }

/** Simulate the bot webhook storing a chat that ran /start <code>. */
function seedChat(chatId, code) {
  db.run(`INSERT INTO telegram_subs (chat_id, binding_code, lang, created_at, updated_at)
          VALUES (?, ?, 'th', ?, ?)`, chatId, code, now, now)
}
const provinceOf = (chatId) =>
  db.get('SELECT province_th FROM telegram_subs WHERE chat_id = ?', chatId)?.province_th ?? null
const codeOf = (chatId) =>
  db.get('SELECT binding_code FROM telegram_subs WHERE chat_id = ?', chatId)?.binding_code ?? null

// ── 1. The attack: bind an arbitrary chat with no / wrong credential ──────
{
  seedChat(1001, 'AAAAAA')
  bindChat(db, { chatId: 1001, code: 'AAAAAA', province_th: 'เชียงใหม่' })
  check('legitimate bind with matching code succeeds', provinceOf(1001) === 'เชียงใหม่')

  // The victim is now a real subscriber. An attacker knows only chat_id.
  seedChat(2002, 'BBBBBB')
  bindChat(db, { chatId: 2002, code: 'BBBBBB', province_th: 'เชียงใหม่' })

  check('hijack with NO code refused',
    refused(() => bindChat(db, { chatId: 2002, province_th: 'ภูเก็ต' })))
  check('hijack with a guessed code refused',
    refused(() => bindChat(db, { chatId: 2002, code: 'ZZZZZZ', province_th: 'ภูเก็ต' })))
  check("victim's province survived both attempts", provinceOf(2002) === 'เชียงใหม่')
}

// ── 2. A valid code may not be used against a DIFFERENT chat ─────────────
{
  seedChat(3003, 'CCCCCC')   // attacker's own chat, holds a legitimate code
  seedChat(4004, 'DDDDDD')   // victim
  bindChat(db, { chatId: 4004, code: 'DDDDDD', province_th: 'ขอนแก่น' })

  check('code valid for another chat cannot bind this one',
    refused(() => bindChat(db, { chatId: 4004, code: 'CCCCCC', province_th: 'ภูเก็ต' })))
  check("victim's province unchanged after cross-chat attempt", provinceOf(4004) === 'ขอนแก่น')
}

// ── 3. Single use — a leaked or replayed code is spent ───────────────────
{
  seedChat(5005, 'EEEEEE')
  bindChat(db, { chatId: 5005, code: 'EEEEEE', province_th: 'เชียงราย' })
  check('binding code cleared after successful bind', codeOf(5005) === null)
  check('replaying the spent code is refused',
    refused(() => bindChat(db, { chatId: 5005, code: 'EEEEEE', province_th: 'ภูเก็ต' })))
  check('province unchanged after replay', provinceOf(5005) === 'เชียงราย')
}

// ── 4. Enrolment of a chat that never contacted the bot ──────────────────
{
  // No webhook row exists for 6006 — it never ran /start, so no code can
  // legitimately match it. This is the spam-enrolment vector.
  check('binding an unknown chat is refused',
    refused(() => bindChat(db, { chatId: 6006, code: 'FFFFFF', province_th: 'ภูเก็ต' })))
  check('no row was created for the unknown chat',
    db.get('SELECT 1 AS x FROM telegram_subs WHERE chat_id = 6006') === undefined)
}

// ── 5. Input validation still holds ──────────────────────────────────────
{
  seedChat(7007, 'GGGGGG')
  check('missing province refused',
    refused(() => bindChat(db, { chatId: 7007, code: 'GGGGGG' })))
  check('non-numeric chatId refused',
    refused(() => bindChat(db, { chatId: NaN, code: 'GGGGGG', province_th: 'ตาก' })))
}

// ── 6. Code generation is CSPRNG-backed, unbiased and well-formed ────────
{
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const codes = new Set()
  let malformed = 0
  for (let i = 0; i < 500; i++) {
    const c = generateBindingCode(db)
    codes.add(c)
    if (c.length !== 6 || [...c].some((ch) => !ALPHABET.includes(ch))) malformed++
  }
  check('generated codes are well-formed (6 chars, safe alphabet)', malformed === 0)
  // Collisions in 500 draws from 32^6 (~1.07B) should be vanishingly rare;
  // a duplicate here would signal a broken or seeded RNG.
  check('500 generated codes are unique', codes.size === 500)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
