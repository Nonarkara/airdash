// SSE tap client with a liveness watchdog — built for weeks of uptime.
// EventSource auto-reconnects, but a silently-dead socket doesn't error, so a
// watchdog recreates the connection when heartbeats stop arriving.
import { emit, store } from './state.js?v=2.0.0-mobile1'

const WATCHDOG_MS = 60_000
let es = null
let lastSeen = 0

function connect() {
  es?.close()
  es = new EventSource('/api/tap')
  lastSeen = Date.now()

  es.onopen = () => { store.connected = true; emit('conn', true) }
  es.onerror = () => { store.connected = false; emit('conn', false) }

  es.addEventListener('tap', (msg) => {
    lastSeen = Date.now()
    try { emit('tap', JSON.parse(msg.data)) } catch { /* malformed frame — skip */ }
  })
  es.addEventListener('hb', () => { lastSeen = Date.now(); store.connected = true; emit('conn', true) })
  es.addEventListener('resync', () => {
    lastSeen = Date.now()
    emit('resync')
  })
}

export function startTap() {
  connect()
  setInterval(() => {
    // Heartbeat comments reset readyState activity but not our event timestamps,
    // so track *any* traffic via readyState + a hard ceiling on silence.
    if (Date.now() - lastSeen > WATCHDOG_MS && es?.readyState !== EventSource.CONNECTING) {
      store.connected = false
      emit('conn', false)
      connect()
    }
  }, 15_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastSeen > WATCHDOG_MS) connect()
  })
}
