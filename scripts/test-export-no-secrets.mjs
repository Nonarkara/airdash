// The weekly export is PUBLIC (GET /api/exports/<file>, no auth). Until
// 2026-09-28 it shipped the `kv` table — admin token, Telegram bot token, LINE
// channel secret/token and both hashing salts — plus every chatbot question.
// This pins the fix: the export is an allow-list, and nothing on the deny-list
// may ever be added back to it. If this fails, do not "fix the test".
import { EXPORT_TABLES, NEVER_EXPORT } from '../server/weeklyExport.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const names = EXPORT_TABLES.map((t) => t.name)
for (const bad of NEVER_EXPORT) check(`public export does not include ${bad}`, !names.includes(bad), `${bad} is in EXPORT_TABLES`)
check('deny-list covers the tables that held secrets/PII', ['kv', 'chat_logs', 'chat_faq', 'line_subs'].every((t) => NEVER_EXPORT.includes(t)))
// Any table whose name suggests credentials or per-person data must be a deliberate decision.
const suspicious = names.filter((n) => /kv|secret|token|sub|chat|user|session|auth|key/i.test(n))
check('no credential/person-shaped table name in the export', suspicious.length === 0, suspicious.join(', '))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
