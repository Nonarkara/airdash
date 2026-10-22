// A client deadline must not cancel the edge's documented fallback window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8')
const proxy = readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8')
const deadline = main.match(/const SNAPSHOT_TIMEOUT_MS = ([\d_]+)/)[1]
const edgeDeadline = Number(proxy.match(/const SNAPSHOT_TIMEOUT_MS = ([\d_]+)/)[1].replaceAll('_',''))
let requestedTimeout
const context = vm.createContext({ AbortSignal: { timeout(ms) { requestedTimeout = ms; return {} } }, fetch: async () => ({ ok: true, json: async () => ({ now: 'observed' }) }), store: {}, emit() {} })
const fn = main.slice(main.indexOf('async function loadSnapshot()'), main.indexOf('\n}', main.indexOf('async function loadSnapshot()')) + 2)
await vm.runInContext(`const SNAPSHOT_TIMEOUT_MS = ${deadline}; ${fn}; loadSnapshot()`, context)
assert.ok(requestedTimeout >= 2 * edgeDeadline + 5000, 'client must allow primary, optional backup, then fallback transfer')
assert.equal(context.store.snapshot.now, 'observed')
assert.ok(/setTimeout\(reveal, 6000\)/.test(main), 'early escape remains available during the longer request')
console.log('PASS snapshot request permits edge fallback and keeps early escape')
