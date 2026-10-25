import { mkdir, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CONFIG } from '../config.js'
import { jpegFrame } from './frameGrab.js'
import { saveGuarded } from '../diskGuard.js'

const folder = join(CONFIG.root, 'data/cctv-frames')
export function previewPath(key) {
  return join(folder, createHash('sha256').update(key).digest('hex') + '.jpg')
}
/**
 * Save a camera preview frame.
 *
 * The write goes through the disk guard: when the disk is nearly full the
 * frame is SHED (the function returns false and nothing is written) instead
 * of throwing ENOSPC 132 times a minute. On 2026-10-24 a full disk produced
 * exactly that storm, and the machine died half an hour later. A preview
 * JPEG is a picture of the data; the data is the product.
 *
 * Returns true when a frame was written, false when it was shed.
 */
export async function savePreview(key, pixels) {
  await mkdir(folder, { recursive: true })
  const image = await jpegFrame(pixels)
  const path = previewPath(key)
  const written = await saveGuarded(path + '.tmp', image, (p, data) => writeFile(p, data))
  if (!written) return false
  await rename(path + '.tmp', path)
  return true
}
