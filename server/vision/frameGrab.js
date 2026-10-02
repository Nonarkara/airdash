// Pull actual pixels out of a live camera.
//
// WHY FFMPEG AND NOT A JS DECODER
// -------------------------------
// The catalogue is HLS, which is MPEG-TS segments. Decoding those in pure JS
// means shipping an H.264 decoder, which is exactly the kind of dependency
// this project has deliberately never had (zero npm deps, see package.json).
// ffmpeg is already on the box — it is what the CCTV health probe's sibling
// tooling uses, and it is the only sane way to get a frame out of HLS in one
// process spawn.
//
// The trick that keeps this dependency-free: we do NOT ask ffmpeg to write a
// JPEG and then read the JPEG. We ask it to write RAW rgb24 to stdout. The
// bytes that come back are a flat array of pixel triples, which Node can hand
// straight to hazeRead.js. No image library is involved at any point.
//
// A frame is FRAME_W x FRAME_H x 3 bytes. ffmpeg's -vf scale does the
// resizing, so we never decode the full-resolution frame into memory.

import { spawn, execFile } from 'node:child_process'
import { FRAME_W, FRAME_H, FRAME_BYTES } from './hazeRead.js'

const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg'
export const GRAB_TIMEOUT_MS = 15_000

/**
 * One frame from an HLS URL, as raw rgb24.
 * Resolves to a Buffer of exactly FRAME_BYTES, or throws.
 *
 * `seekSeconds` skips ahead into the live stream: HLS cameras start their
 * current segment mid-way through the file, so a frame at t=0 is often the
 * very first keyframe, which for a 4-second GOP can be up to 4 s stale. We
 * seek a couple of seconds to get something recent.
 */
export function grabFrame(hlsUrl, { seekSeconds = 2, timeoutMs = GRAB_TIMEOUT_MS, ffmpegPath = FFMPEG } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-loglevel', 'error',
      '-i', hlsUrl,
      '-frames:v', '1',
      '-ss', String(seekSeconds),
      '-vf', `scale=${FRAME_W}:${FRAME_H}`,
      '-pix_fmt', 'rgb24',
      '-f', 'rawvideo',
      'pipe:1',
    ]
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let bytes = 0
    let errText = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`grabFrame timed out after ${timeoutMs} ms`))
    }, timeoutMs)

    child.stdout.on('data', (d) => { const part = d.subarray(0, Math.max(0, FRAME_BYTES - bytes)); chunks.push(part); bytes += part.length })
    child.stderr.on('data', (d) => { errText = (errText + d.toString()).slice(-2048) })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`ffmpeg spawn failed (${ffmpegPath}): ${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (bytes >= FRAME_BYTES) {
        const buf = Buffer.concat(chunks, bytes).subarray(0, FRAME_BYTES)
        return resolve(buf)
      }
      reject(new Error(
        `grabFrame got ${bytes} of ${FRAME_BYTES} bytes (exit ${code})` +
        (errText ? `: ${errText.trim().split('\n').slice(-1)[0]}` : '')))
    })
  })
}

/**
 * The URL to hand ffmpeg for a camera.
 *
 * Historically this was `hls_url`, which meant only HLS cameras could ever be
 * sampled. iTIC's `mjpeg2.php?camid=…` is an endless multipart/x-mixed-replace
 * HTTP body — ffmpeg opens it exactly as happily as a playlist, verified on
 * 2026-09-29 — but it lives in `viewer_url`, so 27 cameras were invisible to
 * the collector. The registry now tags every camera with `grab_url`; fall back
 * to `hls_url` so a bare `{hls_url}` object still works.
 */
export function grabUrlOf(cam) {
  return cam.grab_url || cam.hls_url || cam.snapshot_url || (cam.stream_kind === 'mjpeg' ? cam.viewer_url : null) || null
}

/**
 * Frames from several cameras at once, with a per-host concurrency cap.
 *
 * The cap is not decoration. These are municipal and government servers
 * (iticfoundation.org, gistda.or.th) and the CCTV health probe already
 * learned this the hard way: 40 concurrent probes from one IP saturates the
 * bucket and the box stops serving. We hold 3 in flight per host and 12
 * overall, the same numbers cctvHealth.js uses.
 */
export async function grabMany(cameras, { concurrency = 12, perHost = 3, ...opts } = {}) {
  const queue = cameras.filter((c) => grabUrlOf(c))
  const busy = new Map()
  const out = new Map()
  const hostOf = (c) => { try { return new URL(grabUrlOf(c)).host } catch { return 'invalid' } }

  await new Promise((resolve) => {
    let active = 0
    const pump = () => {
      while (active < concurrency) {
        const i = queue.findIndex((c) => (busy.get(hostOf(c)) ?? 0) < perHost)
        if (i < 0) break
        const cam = queue.splice(i, 1)[0]
        const host = hostOf(cam)
        busy.set(host, (busy.get(host) ?? 0) + 1)
        active++
        grabFrame(grabUrlOf(cam), { ...opts, seekSeconds: cam.stream_kind === 'snapshot' ? 0 : (opts.seekSeconds ?? 2) })
          .then((buf) => out.set(cam, buf))
          .catch(() => out.set(cam, null))
          .finally(() => { busy.set(host, busy.get(host) - 1); active--; pump() })
      }
      if (!active && !queue.length) resolve()
    }
    pump()
  })
  // A second phase keeps fallback JPEG hosts under the same concurrency cap.
  const fallbacks = cameras.filter(c => !out.get(c) && c.snapshot_url && c.snapshot_url !== grabUrlOf(c))
    .map(original => ({ original, camera: { ...original, grab_url: original.snapshot_url,
      snapshot_url: null, hls_url: null, stream_kind: 'snapshot' } }))
  if (fallbacks.length) {
    const frames = await grabMany(fallbacks.map(f => f.camera), { concurrency, perHost, ...opts })
    for (const f of fallbacks) out.set(f.original, frames.get(f.camera) ?? null)
  }
  return out
}

export function jpegFrame(buf, { ffmpegPath = FFMPEG } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(ffmpegPath, ['-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
      '-video_size', `${FRAME_W}x${FRAME_H}`, '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'],
    { timeout: 5000, maxBuffer: 512*1024, encoding: 'buffer' }, (err, out) => err ? reject(err) : resolve(out))
    child.stdin.on('error', () => {})
    child.stdin.end(buf)
  })
}
