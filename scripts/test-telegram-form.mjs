// The dashboard's Telegram sign-up can actually complete.
//
// WHY THIS GUARD EXISTS (2026-11-18)
// Three faults stacked in public/js/panels/citizen.js's renderTelegramForm:
//   1. the section started `hidden` and nothing ever showed it, so nobody saw it;
//   2. init() stored the binding code and then called enterIdle(), which set
//      state.code = null, so polling asked the server for an empty code;
//   3. every snapshot repaint built a new form with a NEW code, so a reader who
//      had tapped the bot link with code A was polled for code B.
// Two chats were bound in four months, both before the form existed.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../public/js/panels/citizen.js', import.meta.url), 'utf8')
const start = src.indexOf('function renderTelegramForm(')
const body = src.slice(start, src.indexOf('\nfunction ', start + 10))
let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const idle = body.slice(body.indexOf('const enterIdle'), body.indexOf('const enterWaiting'))
check('enterIdle does not discard the binding code', !/state\.code\s*=\s*null/.test(idle) && !/tgSession\.code\s*=\s*null/.test(idle), 'the code is what the bot link carries')
check('the section is shown once a code is in hand', /wrap\.hidden\s*=\s*false/.test(body), 'it started hidden and nothing showed it')
check('the binding session lives outside the widget', /^let tgSession = null/m.test(src) && /tgSession\s*=\s*\{\s*code:/.test(body))
check('a repaint reuses the code instead of fetching a new one', /if \(!tgSession \|\| Date\.now\(\) - tgSession\.at > TG_CODE_TTL_MS\)/.test(body))
check('a repaint resumes the reader\'s step (waiting / ready)', /tgSession\.phase === 'waiting'/.test(body) && /tgSession\.phase === 'ready'/.test(body))
check('polling asks for the session code', /code-status\?code=\$\{encodeURIComponent\(state\.code/.test(body) && /get code\(\) \{ return tgSession\?\.code/.test(body))
check('bind sends the same code the bot recorded', /code: state\.code,/.test(body))

const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8')
check('a hidden step stays hidden despite its display rule', /\.citizen-tg-subscribe \[hidden\]\s*\{\s*display:\s*none/.test(css), '"Link this province" showed before a chat existed')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
