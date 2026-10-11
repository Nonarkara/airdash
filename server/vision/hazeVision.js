// Sample a bounded rotation of published public camera streams and snapshots.
// Keep the latest preview, optional station context, and per-camera daylight
// reference features. An optical change is possible haze, never measured PM2.5.
import { CONFIG } from '../config.js'
import { log } from '../util.js'
import { composeAll } from '../sources/cctvRegistry.js'
import { hydrateOnce } from '../sources/cctvHealthStore.js'
import { pairAir } from '../airCctv.js'
import { airStationsNow } from '../airStationsNow.js'
import { grabMany, grabUrlOf } from './frameGrab.js'
import { readFrame } from './hazeRead.js'
import { coverageReport, REACHABLE_KINDS } from './coverage.js'
import { frameIdentity, assessHaze } from './hazeSignal.js'
import { savePreview } from './frameStore.js'
import { floodWallCameras, choosePanel, loadHealth, recordHealth, provinceOf } from './floodWall.js'
import { daylightInThailand } from './hazeSignal.js'

/** Hard ceiling on ffmpeg spawns per cycle. Sampling is I/O bound, not CPU
 *  bound — the whole reachable set costs a few seconds of wall clock. This is
 *  a blast-radius guard, not a sampling plan: if the catalogue ever grows past
 *  it we want to notice in the log, not silently sample a prefix of it. */
const MAX_CAMS = 320 // ~76 rotating HLS/still cameras + the ≤231-camera flood-wall panel
const PANEL_EVERY_MS = 55 * 60_000 // flood-wall panel ~hourly (polite to small hosts)

/** Rotate through a list so consecutive cycles do not hammer the same few. */
function stridePick(cams, n, tick) {
  if (cams.length <= n) return cams
  const out = []
  const start = (tick * n) % cams.length
  for (let k = 0; k < n; k++) out.push(cams[(start + k) % cams.length])
  return out
}

export default {
  name: 'hazeVision',
  label_th: 'ภาพกล้องสาธารณะ + ตรวจหมอกควันช่วงกลางวัน',
  label_en: 'Public camera samples + daylight haze checks',
  intervalMs: CONFIG.intervals.haze_vision ?? 30 * 60_000,
  enabled: true,
  // Bumped when the extraction changes, so the boot guard re-runs this source
  // once after a deploy instead of deferring it and leaving the feature table
  // populated with the old shape. NB the field is `version`, not
  // `dataVersion` — server/scheduler.js reads s.source.version. A source that
  // declares `dataVersion` is silently ignored by the guard and deferred
  // forever, which is exactly what happened to the first run of this source.
  version: 6, // 6: flood-wall panel + province_code

  async run({ db }) {
    // The registry's health overlay reads an in-process map that is only
    // populated when cctvHealth runs. cctvHealth is deferred by the boot
    // guard on most restarts (it succeeded recently, so there is nothing to
    // re-probe), which means without this call the map is EMPTY and every
    // camera comes back stream_status 'unknown' — the first version of this
    // source sampled zero cameras and logged "no live streams", while
    // /api/health simultaneously reported 63 live streams. Same hydrateOnce
    // call cctvHealth makes, for the same reason.
    hydrateOnce(db)
    const cat = await composeAll({ useCache: true, skipHealth: false })

    const tick = ((Number(db.kvGet('cctv_vision_cursor')) || 0) + 1) % 9973
    db.kvSet('cctv_vision_cursor', String(tick))
    const hlsLive = cat.cameras.filter(c => c.stream_status === 'live' && c.stream_kind === 'hls' && grabUrlOf(c))
    const mjpeg = cat.cameras.filter(c => c.stream_kind === 'mjpeg')
    const stills = cat.cameras.filter(c => c.source === 'itic' && c.snapshot_url && c.stream_status !== 'live')
    const municipal = cat.cameras.filter(c => c.source !== 'itic' && c.stream_kind === 'snapshot')
    const alternatives = [...stridePick(mjpeg, 6, tick), ...stridePick(stills, 12, tick), ...stridePick(municipal, 6, tick)]
      .map(c => c.stream_status === 'down' && c.snapshot_url ? { ...c, grab_url: c.snapshot_url, stream_kind: 'snapshot' } : c)
    // Probe a bounded rotating batch; a dead HLS URL may still publish a JPEG.
    const urls = new Set()
    const candidates = [...hlsLive, ...alternatives].filter(c => {
      const url = grabUrlOf(c)
      if (!url || urls.has(url)) return false
      urls.add(url); return true
    })
    if (!candidates.length) return { sampled: 0, reachable: 0 }
    // FloodDash's flood-wall snapshot cameras as a stable per-province panel
    // (server/vision/floodWall.js). Daylight only — a night frame cannot show
    // haze — and every other cycle (hourly), to stay polite to small hosts.
    const nowMsIso = new Date().toISOString()
    const lastPanel = Number(db.kvGet('flood_wall_panel_at') ?? 0)
    const panelDue = daylightInThailand(nowMsIso) && Date.now() - lastPanel >= PANEL_EVERY_MS
    const panel = panelDue ? choosePanel(await floodWallCameras(), loadHealth(db)) : []
    if (panel.length) db.kvSet('flood_wall_panel_at', String(Date.now()))
    // A station is useful context, never a prerequisite for seeing the sky.
    const stations = airStationsNow(db)
    const pick = [...stridePick(pairAir(candidates, stations), MAX_CAMS - panel.length, tick), ...pairAir(panel, stations)]
    const frames = await grabMany(pick, { perHost: 2 })
    if (panel.length) {
      const panelKeys = new Set(panel.map((c) => `${c.source}:${c.id}`))
      recordHealth(db, pick.filter((c) => panelKeys.has(`${c.source}:${c.id}`))
        .map((c) => ({ key: `${c.source}:${c.id}`, ok: frames.has(c) })))
    }
    const nowIso = new Date().toISOString()
    const grabbedKeys = new Set()
    let stored = 0
    let scored = 0
    let blank = 0
    const quality = {}
    for (const cam of pick) {
      const buf = frames.get(cam)
      if (!buf) continue
      const key = cam.source + ':' + cam.id
      grabbedKeys.add(key)
      const r = readFrame(buf)
      if (!r.ok) continue
      const identity = frameIdentity(buf)
      const history = db.all(`SELECT obs_time, contrast, mean_luma, frame_hash, view_signature, dark_normalized, haze_status
        FROM cctv_haze_frames WHERE camera_key = ? AND obs_time >= ? ORDER BY obs_time DESC LIMIT 700`,
        key, new Date(Date.now() - 14*86400_000).toISOString())
      const signal = assessHaze(r, identity, history, nowIso)
      quality[signal.status] = (quality[signal.status] ?? 0) + 1
      const index = ['possible-haze', 'unchanged'].includes(signal.status) ? signal.contrastLoss : null
      if (index !== null) scored++
      if (signal.status === 'blank') blank++
      let preview = 0
      try { await savePreview(key, buf); preview = 1 } catch (e) { log('warn', 'camera preview unavailable', { camera: key, error: String(e) }) }
      db.run(
        `INSERT INTO cctv_haze_frames
           (camera_key, camera_source, lat, lng, obs_time, haze_index, calibrated,
            corridor_tail, contrast, edge_density, dark_channel, transmission,
            edge_decay, saturation, warm_bias, mean_luma, tint_hint,
            pm25, pm25_station, pm25_km, haze_status, contrast_loss, baseline_samples,
            frame_hash, view_signature, dark_normalized, has_preview, province_code)
         VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        key, cam.source, cam.lat, cam.lng, nowIso, index,
        r.features.corridorTail, r.features.contrast, r.features.edgeDensity,
        r.features.darkChannel, r.features.transmission, r.features.edgeDecay,
        r.features.saturation, r.features.warmBias, r.features.meanLuma, null,
        cam.air?.pm25 ?? null, cam.air?.station_key ?? null, cam.air?.km ?? null,
        signal.status, signal.contrastLoss, signal.baselineSamples, identity.hash,
        JSON.stringify(identity.signature), r.features.darkChannelNorm, preview,
        cam.province_code ?? provinceOf(key, cam.lat, cam.lng)?.code ?? null,
      )
      stored++
    }
    const coverage = coverageReport(cat.cameras, { grabbedKeys })
    const result = { sampled: stored, scored, blank, attempted: pick.length, failed: pick.length-stored, panel: panel.length,
      quality, reachable: coverage.reachable, unavailable: coverage.unreachable,
      coverage_pct: coverage.pct_reachable, calibration_ok: false }
    db.kvSet('cctv_vision_cycle', JSON.stringify({ ...result, observed_at: nowIso }))
    log('info', 'haze_vision sampled', result)
    return { ...result, seen: pick.length, added: stored }
  },
}
