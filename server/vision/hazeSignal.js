// Conservative, per-camera change detection. An optical cue cannot identify
// pollution, distinguish rain/fog/smoke, or estimate PM2.5 from pixels.
import { createHash } from 'node:crypto'
import { FRAME_W, FRAME_H } from './hazeRead.js'

export function daylightInThailand(iso) {
  const hour = new Date(Date.parse(iso) + 7 * 3600_000).getUTCHours()
  return hour >= 6 && hour < 18
}

// Coarse normalized scene structure: exposure/contrast changes preserve this
// pattern; a pan, zoom, obstruction, or changed scene often does not.
export function frameIdentity(buf) {
  const cells = new Array(32).fill(0)
  let sum = 0, sum2 = 0, clipped = 0
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    const i = (y * FRAME_W + x) * 3
    const l = .299 * buf[i] + .587 * buf[i + 1] + .114 * buf[i + 2]
    cells[Math.floor(y / (FRAME_H / 4)) * 8 + Math.floor(x / (FRAME_W / 8))] += l
    sum += l; sum2 += l * l
    if (l > 250) clipped++
  }
  const n = FRAME_W * FRAME_H, mean = sum / n
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean))
  const grid = cells.map(v => v / (n / 32))
  const gMean = grid.reduce((a,b) => a+b, 0) / 32
  const norm = Math.sqrt(grid.reduce((a,v) => a + (v-gMean)**2, 0)) || 1
  return { hash: createHash('sha256').update(buf).digest('hex'), std,
    clipped: clipped / n, signature: grid.map(v => (v-gMean)/norm) }
}

export function assessHaze(read, identity, history, observedAt) {
  const result = (status, extra = {}) => ({ status, contrastLoss: null, baselineSamples: 0, ...extra })
  const f = read.features
  if (identity.std < 3 || identity.clipped > .95) return result('blank')
  if (!daylightInThailand(observedAt) || f.meanLuma < 40) return result('low-light')
  const time = Date.parse(observedAt)
  const valid = (history ?? []).filter(r => r.frame_hash && Number.isFinite(r.contrast) && r.contrast > 0 && r.mean_luma >= 40 &&
    ['baseline-needed', 'unchanged', 'possible-haze', 'changed-view'].includes(r.haze_status) &&
    Date.parse(r.obs_time) < time && time - Date.parse(r.obs_time) <= 14 * 86400_000)
  const previous = (history ?? []).filter(r => Date.parse(r.obs_time) < time)
    .sort((a,b) => Date.parse(b.obs_time)-Date.parse(a.obs_time))[0]
  if (previous?.frame_hash === identity.hash && time-Date.parse(previous.obs_time) >= 5*60_000) return result('frozen')
  const hour = new Date(observedAt).getUTCHours()
  const comparable = valid.filter(r => {
    const dh = Math.abs(new Date(r.obs_time).getUTCHours()-hour)
    return Math.min(dh, 24-dh) <= 2
  })
  const seen = new Set()
  const sameView = comparable.filter(r => {
    if (seen.has(r.frame_hash)) return false
    seen.add(r.frame_hash)
    let signature
    try { signature = JSON.parse(r.view_signature) } catch { return false }
    if (!Array.isArray(signature) || signature.length !== identity.signature.length) return false
    return signature.reduce((a,v,i) => a + v*identity.signature[i], 0) >= .75
  })
  if (sameView.length < 3) return result(comparable.length >= 3 ? 'changed-view' : 'baseline-needed', { baselineSamples: sameView.length })
  const sorted = sameView.sort((a,b) => (b.contrast/b.mean_luma)-(a.contrast/a.mean_luma))
  // Median of the top third reduces reliance on one unusually sharp frame.
  const reference = sorted[Math.floor(Math.max(1, Math.ceil(sorted.length/3))/2)]
  const loss = Math.max(0, Math.min(1, 1-(f.contrast/f.meanLuma)/(reference.contrast/reference.mean_luma)))
  // Require two cues: lost contrast AND increased normalized dark channel.
  // Still only "possible haze": fog, rain and lens contamination can agree.
  const rise = f.darkChannelNorm - reference.dark_normalized
  return result(loss >= .25 && Number.isFinite(rise) && rise >= .05 ? 'possible-haze' : 'unchanged', {
    contrastLoss: Math.round(loss*100), baselineSamples: sameView.length,
  })
}
