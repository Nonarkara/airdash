// Raw optical signals → per-province haze EVIDENCE (the "cooked" side).
//
// Inputs (all already ingested):
//   · cameras  — cctv_haze_frames: each camera judged against its OWN clear-day
//                baseline (hazeSignal.assessHaze): 'possible-haze' | 'unchanged'
//   · humidity — openmeteo rh_pct: ≥ FOG_RH means fog/mist is the likelier cause
//   · airports — METAR visibility + the observer's own cause code (HZ/FU = haze
//                or smoke; BR/FG = mist/fog)
//
// What it may claim, and what it may not. Pixels and visibility do not measure
// PM2.5. This module never produces a µg/m³ number. It produces corroboration:
// "5 of 8 cameras look hazier than usual; the airport reports smoke at 4 km".
// risk.js uses it to (a) add plain-language reasons to the verdict and (b) in
// exactly one case raise a province to at least WATCH: no ground PM2.5 sensor
// is reporting there, and widespread non-fog camera haze says something is in
// the air. A working sensor is never overridden by a camera.
const WINDOW_MS = 2 * 3600_000     // a camera reading older than this says nothing about now
const MIN_VALID = 2                // fewer judged cameras than this → 'insufficient'
const FOG_RH = 90                  // % — above this, contrast loss is more likely fog/mist
const METAR_FRESH_H = 3
const TTL_MS = 5 * 60_000

/** Pure: roll the latest judged frame per camera up to a province level. */
export function provinceLevel(frames) {
  const latest = new Map()
  for (const f of frames) {
    const cur = latest.get(f.camera_key)
    if (!cur || f.obs_time > cur.obs_time) latest.set(f.camera_key, f)
  }
  const judged = [...latest.values()].filter((f) => f.haze_status === 'possible-haze' || f.haze_status === 'unchanged')
  const hazy = judged.filter((f) => f.haze_status === 'possible-haze')
  const losses = hazy.map((f) => f.contrast_loss).filter(Number.isFinite).sort((a, b) => a - b)
  const share = judged.length ? hazy.length / judged.length : null
  const level = judged.length < MIN_VALID ? 'insufficient'
    : share >= 0.5 && hazy.length >= 2 ? 'widespread'
      : share >= 0.25 ? 'some'
        : 'clear'
  return {
    level, cams_judged: judged.length, cams_hazy: hazy.length, cams_seen: latest.size,
    share: share === null ? null : Math.round(share * 100) / 100,
    median_contrast_loss: losses.length ? losses[Math.floor(losses.length / 2)] : null,
  }
}

/** Pure: should cameras raise this province to at least WATCH? */
export function shouldFloorToWatch(p, ev) {
  if (!ev || ev.level !== 'widespread' || ev.fog_likely) return false
  return p?.pm25 == null || p?.pm25_source !== 'air4thai' // no ground sensor reporting
}

const cache = new WeakMap()

/** code → evidence. Never throws: on failure, no evidence (and nothing moves). */
export function hazeEvidence(db) {
  const c = cache.get(db)
  if (c && Date.now() - c.at < TTL_MS) return c.value
  const out = new Map()
  try {
    const sinceUtc = new Date(Date.now() - WINDOW_MS).toISOString()
    const frames = db.all(
      `SELECT camera_key, province_code, haze_status, contrast_loss, obs_time
         FROM cctv_haze_frames WHERE obs_time >= ? AND province_code IS NOT NULL`, sinceUtc)
    const byCode = new Map()
    for (const f of frames) {
      const list = byCode.get(f.province_code) ?? []
      list.push(f); byCode.set(f.province_code, list)
    }
    const localCut = (h) => new Date(Date.now() + 7 * 3600_000 - h * 3600_000).toISOString().slice(0, 16)
    const rh = new Map(db.all(
      `SELECT station_key AS code, value FROM latest
        WHERE source = 'openmeteo' AND metric = 'rh_pct' AND obs_time >= ?`, localCut(6)).map((r) => [String(r.code), r.value]))
    const metar = new Map()
    for (const r of db.all(
      `SELECT s.province_code AS code, s.name_th, s.name_en, s.meta_json, l.value AS vis_km, l.obs_time
         FROM latest l JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
        WHERE l.source = 'metar' AND l.metric = 'vis_km' AND l.obs_time >= ? AND s.province_code IS NOT NULL`, localCut(METAR_FRESH_H))) {
      let cause = null
      try { cause = JSON.parse(r.meta_json ?? '{}').cause ?? null } catch { /* no cause */ }
      const cur = metar.get(String(r.code))
      if (!cur || r.vis_km < cur.vis_km) metar.set(String(r.code), { station_th: r.name_th, station_en: r.name_en, vis_km: r.vis_km, cause, obs_time: r.obs_time })
    }
    const codes = new Set([...byCode.keys(), ...metar.keys()])
    for (const code of codes) {
      const cam = provinceLevel(byCode.get(code) ?? [])
      const m = metar.get(code) ?? null
      const humidity = rh.get(code) ?? null
      out.set(code, {
        ...cam,
        humidity_pct: humidity,
        // METAR 'obscure' = FG/BR (fog, mist) in the observer's own report.
        fog_likely: (Number.isFinite(humidity) && humidity >= FOG_RH) || m?.cause === 'obscure',
        metar: m,
      })
    }
  } catch { /* evidence is optional; the verdict stands without it */ }
  cache.set(db, { at: Date.now(), value: out })
  return out
}
