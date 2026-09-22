// Instagram-style preset filters.
// Stored as a single CSS `filter` string. Used both for the live preview
// and for baking the filter into the uploaded image via canvas.

import type { CropArea } from './types'

export type FilterPreset = {
  id: string
  label: string
  css: string  // valid CSS `filter` value, e.g. "brightness(1.1) saturate(1.4)"
}

export const FILTERS: readonly FilterPreset[] = [
  { id: 'normal',  label: 'Normal',  css: 'none' },
  { id: 'vivid',   label: 'Vivid',   css: 'saturate(1.4) contrast(1.1) brightness(1.05)' },
  { id: 'cool',    label: 'Cool',    css: 'saturate(1.1) brightness(1.05) hue-rotate(-10deg)' },
  { id: 'warm',    label: 'Warm',    css: 'saturate(1.15) brightness(1.05) hue-rotate(10deg) sepia(0.15)' },
  { id: 'mono',    label: 'Mono',    css: 'grayscale(1) contrast(1.1)' },
  { id: 'sepia',   label: 'Sepia',   css: 'sepia(0.6) contrast(1.05)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.35) saturate(0.85) contrast(0.95) brightness(1.05)' },
  { id: 'fade',    label: 'Fade',    css: 'saturate(0.85) contrast(0.9) brightness(1.08)' },
] as const

export const NORMAL = FILTERS[0]

/**
 * Re-encode an image with the given CSS filter baked in, optionally cropping
 * to a given source-pixel rect. If `area` is null, the full image is used.
 */
export async function bakeImageToBlob(
  src: HTMLImageElement,
  opts: { cssFilter: string; area: CropArea | null; quality?: number },
): Promise<Blob> {
  const sw0 = src.naturalWidth
  const sh0 = src.naturalHeight
  if (!sw0 || !sh0) throw new Error('Image not loaded yet.')

  const sx = opts.area ? Math.max(0, Math.round(opts.area.x))             : 0
  const sy = opts.area ? Math.max(0, Math.round(opts.area.y))             : 0
  const sw = opts.area ? Math.min(sw0 - sx, Math.round(opts.area.width))  : sw0
  const sh = opts.area ? Math.min(sh0 - sy, Math.round(opts.area.height)) : sh0

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.filter = opts.cssFilter
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      opts.quality ?? 0.9,
    )
  })
}
