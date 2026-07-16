// Assembles the connected-waterways payload: each reach with its live + forecast
// discharge, risk band, trend, and the directed cascade links (upstream sources
// and downstream chain with cumulative transit lag). This is where the river
// network becomes a story: rising discharge upstream today → downstream in N days.
import { REACHES, REACH_BY_ID, dischargeBand, upstreamOf, downstreamChain } from './rivers.js'

export function buildCascade(db) {
  // Latest discharge + forecast peak per reach.
  const rows = db.all(
    `SELECT station_key, metric, value, obs_time FROM latest WHERE source = 'glofas'`,
  )
  const byReach = new Map()
  for (const r of rows) {
    let e = byReach.get(r.station_key)
    if (!e) { e = { obs_time: r.obs_time }; byReach.set(r.station_key, e) }
    e[r.metric] = r.value
    if (r.obs_time > e.obs_time) e.obs_time = r.obs_time
  }

  const reaches = REACHES.map((reach) => {
    const d = byReach.get(reach.id) ?? {}
    const today = d.discharge ?? null
    const peak = d.discharge_fc_peak ?? null
    const peakDay = d.discharge_fc_peak_day ?? null
    const nowBand = dischargeBand(reach, today)
    const peakBand = dischargeBand(reach, peak)
    const trend = peak !== null && today !== null && today > 0
      ? (peak > today * 1.15 ? 'rising' : peak < today * 0.85 ? 'falling' : 'stable')
      : 'unknown'
    return {
      id: reach.id,
      name_th: reach.name_th, name_en: reach.name_en,
      basin_th: reach.basin_th, basin_en: reach.basin_en,
      region_th: reach.region_th, region_en: reach.region_en,
      lat: reach.lat, lng: reach.lng,
      note_th: reach.note_th, note_en: reach.note_en,
      downstream: reach.downstream, lagDays: reach.lagDays,
      thresholds: { watch: reach.watch, warning: reach.warning, emergency: reach.emergency },
      discharge: today, forecastPeak: peak, forecastPeakDay: peakDay,
      band: nowBand, peakBand, trend,
      obs_time: d.obs_time ?? null,
    }
  })

  // Directed links for drawing the network graph on the map.
  const links = REACHES
    .filter((r) => r.downstream && REACH_BY_ID.has(r.downstream))
    .map((r) => {
      const to = REACH_BY_ID.get(r.downstream)
      return {
        from: r.id, to: r.downstream, lagDays: r.lagDays,
        fromLat: r.lat, fromLng: r.lng, toLat: to.lat, toLng: to.lng,
      }
    })

  // The Chao Phraya headwaters→Bangkok chain, annotated — the flagship cascade.
  const flagship = downstreamChain('nan_phitsanulok').map(({ reach, cumLagDays }) => {
    const d = byReach.get(reach.id) ?? {}
    return {
      id: reach.id, name_th: reach.name_th, name_en: reach.name_en,
      discharge: d.discharge ?? null, forecastPeak: d.discharge_fc_peak ?? null,
      band: dischargeBand(reach, d.discharge ?? null), cumLagDays,
    }
  })

  return {
    updated: new Date().toISOString(),
    method_th: 'อัตราการไหลจาก GloFAS (Open-Meteo) · หน่วง = เวลาคลื่นน้ำเดินทางลงปลายน้ำ',
    method_en: 'River discharge from GloFAS (Open-Meteo) · lag = flood-wave travel time downstream',
    reaches, links, flagship,
    reachById: undefined, // keep payload flat
  }
}

/** For the RAG/context: upstream reaches feeding a reach, with their discharge. */
export function upstreamContext(db, reachId) {
  const ups = upstreamOf(reachId)
  return ups.map((u) => {
    const row = db.get('SELECT value FROM latest WHERE source = ? AND station_key = ? AND metric = ?',
      'glofas', u.id, 'discharge')
    return { id: u.id, name_th: u.name_th, name_en: u.name_en, lagDays: u.lagDays, discharge: row?.value ?? null }
  })
}
