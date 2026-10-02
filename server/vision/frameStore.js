import { mkdir, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CONFIG } from '../config.js'
import { jpegFrame } from './frameGrab.js'

const folder = join(CONFIG.root, 'data/cctv-frames')
export function previewPath(key) {
  return join(folder, createHash('sha256').update(key).digest('hex') + '.jpg')
}
export async function savePreview(key, pixels) {
  await mkdir(folder, { recursive: true })
  const image = await jpegFrame(pixels)
  const path = previewPath(key)
  await writeFile(path + '.tmp', image)
  await rename(path + '.tmp', path)
}
