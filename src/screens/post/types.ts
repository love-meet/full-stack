// Shared state for the 3-step post composer.

import type { FilterPreset } from './filters'

export type Step = 'pick' | 'edit' | 'compose'

export type AspectId = 'original' | '1:1' | '4:5' | '16:9'

export const ASPECTS: { id: AspectId; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1',      label: '1:1',      ratio: 1 },
  { id: '4:5',      label: '4:5',      ratio: 4 / 5 },
  { id: '16:9',     label: '16:9',     ratio: 16 / 9 },
]

/** Effective aspect (width / height) for an image with the given source ratio. */
export function effectiveRatio(aspect: AspectId, naturalRatio: number): number {
  if (aspect === 'original') return naturalRatio
  return ASPECTS.find((a) => a.id === aspect)!.ratio!
}

/**
 * The drag/pinch crop rectangle in source-image pixel space.
 * Matches the shape react-easy-crop returns from onCropComplete's
 * croppedAreaPixels callback.
 */
export type CropArea = {
  x: number      // source-image px, left edge of crop
  y: number      // source-image px, top edge of crop
  width: number  // source-image px
  height: number // source-image px
}

/** Selected video segment, in seconds. Capped to ≤ 60s by the trim UI. */
export type Trim = { start: number; end: number }

export const MAX_VIDEO_SECONDS = 60

export type Media = {
  file: File
  previewUrl: string                // object URL for the picked file
  kind: 'image' | 'short_video'
  width: number                     // natural width in px
  height: number                    // natural height in px
  duration: number | null           // seconds (videos only; null = unknown/image)
  filter: FilterPreset              // selected filter (Normal for video)
  aspect: AspectId                  // current frame aspect
  crop: CropArea | null             // current crop in source-image px (null for video / pre-pick)
  trim: Trim | null                 // selected segment for video (null = whole/unset)
}
