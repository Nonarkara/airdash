// Event bus: every pipeline event flows through here — persisted to the events
// table, kept in a ring buffer for SSE replay, and fanned out to live clients.
import { CONFIG } from './config.js'
import { log } from './util.js'

export function createBus(db) {
  const ring = []              // last N events, ascending id
  const clients = new Set()    // http responses subscribed to /api/tap

  function publish(evt) {
    const e = {
      ts: new Date().toISOString(),
      kind: evt.kind,
      source: evt.source ?? null,
      station_key: evt.station_key ?? null,
      severity: evt.severity ?? 0,
      title_th: evt.title_th ?? null,
      title_en: evt.title_en ?? null,
      payload_json: evt.payload ? JSON.stringify(evt.payload) : null,
    }
    e.id = db.insertEvent(e)

    ring.push(e)
    if (ring.length > CONFIG.tapRingSize) ring.shift()

    const frame = `id: ${e.id}\nevent: tap\ndata: ${JSON.stringify(publicShape(e))}\n\n`
    for (const res of clients) {
      try { res.write(frame) } catch { clients.delete(res) }
    }
    return e.id
  }

  function subscribe(res, lastEventId) {
    clients.add(res)
    res.on('close', () => clients.delete(res))

    const lastId = Number(lastEventId)
    if (Number.isFinite(lastId) && lastId > 0 && ring.length > 0) {
      if (lastId >= ring[0].id - 1) {
        for (const e of ring) {
          if (e.id > lastId) res.write(`id: ${e.id}\nevent: tap\ndata: ${JSON.stringify(publicShape(e))}\n\n`)
        }
      } else {
        // Client is too far behind the ring — tell it to refetch state.
        res.write(`event: resync\ndata: {}\n\n`)
      }
    }
  }

  function publicShape(e) {
    return {
      id: e.id, ts: e.ts, kind: e.kind, source: e.source, severity: e.severity,
      station_key: e.station_key, title_th: e.title_th, title_en: e.title_en,
      payload: e.payload_json ? JSON.parse(e.payload_json) : null,
    }
  }

  // Heartbeat as a REAL event (comments are invisible to EventSource) so the
  // browser watchdog can distinguish a quiet-but-alive socket from a dead one.
  const heartbeat = setInterval(() => {
    const frame = `event: hb\ndata: ${Date.now()}\n\n`
    for (const res of clients) {
      try { res.write(frame) } catch { clients.delete(res) }
    }
  }, CONFIG.sseHeartbeatMs)
  heartbeat.unref()

  function stats() {
    return { clients: clients.size, ringSize: ring.length, lastId: ring.at(-1)?.id ?? null }
  }

  log('info', 'bus ready')
  return { publish, subscribe, publicShape, stats }
}
