// Cloudinary unsigned upload from the browser.
//
// Requires an *unsigned* upload preset (Cloudinary dashboard → Settings →
// Upload → Add upload preset → Signing Mode: Unsigned). The cloud name
// and preset both ship to the browser and are fine to be public; the
// preset is what restricts what kinds of uploads are allowed.

export type CloudinaryResource = 'image' | 'video' | 'auto'

export type UploadOptions = {
  /** Cloudinary folder, e.g. "lm-app/posts/<user_id>". */
  folder?: string
  /** Resource type. Inferred from file.type if omitted. */
  resourceType?: CloudinaryResource
  /** Optional public_id (defaults to a random one Cloudinary generates). */
  publicId?: string
  /** Free-form tags so we can find/delete things later. */
  tags?: string[]
}

export type UploadResult = {
  url: string         // secure_url, https
  publicId: string    // can be used to construct transform URLs later
  format: string      // e.g. "jpg", "mp4"
  width: number
  height: number
  duration?: number   // seconds, present for video
  resourceType: CloudinaryResource
  bytes: number
}

/**
 * Build a tiny, heavily-blurred preview URL from a full Cloudinary delivery URL
 * — used as a placeholder underneath a chat-bubble's media while the real
 * asset is still downloading. The transform `e_blur:1500,w_60,h_60,c_fill,q_30`
 * yields a ~2–4 KB JPEG, served from Cloudinary's CDN edge cache.
 *
 * For VIDEO sources we also extract a still frame (`so_0`) and force JPEG
 * output (`f_jpg`) so the placeholder is an image, not a tiny video file.
 *
 * Returns null for non-Cloudinary URLs so the caller falls back to the
 * normal "just show the spinner" path.
 */
export function cloudinaryPlaceholderUrl(
  url: string,
  kind: 'image' | 'video',
): string | null {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return null
  }
  const imageTransform = 'w_60,h_60,c_fill,e_blur:1500,q_30'
  const videoTransform = 'w_60,h_60,c_fill,e_blur:1500,so_0,f_jpg,q_30'
  if (kind === 'video') {
    return url
      .replace('/upload/', `/upload/${videoTransform}/`)
      .replace(/\.\w+$/, '.jpg')
  }
  return url.replace('/upload/', `/upload/${imageTransform}/`)
}

/**
 * Build a compressed delivery URL for a posted video: transcodes to MP4
 * (plays everywhere incl. iOS), auto-compresses (`q_auto`), and caps the
 * resolution (`c_limit,h_1280`) to keep feed playback light. When a trim
 * is given, also cuts to [start,end] on Cloudinary's side (used for the
 * big-file fallback where we couldn't trim client-side).
 */
export function cloudinaryVideoUrl(
  url: string,
  trim?: { start: number; end: number } | null,
): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url
  const parts: string[] = ['q_auto', 'c_limit,h_1280']
  if (trim && trim.end > trim.start) {
    parts.unshift(`so_${trim.start.toFixed(2)}`, `eo_${trim.end.toFixed(2)}`)
  }
  return url.replace('/upload/', `/upload/${parts.join(',')}/`).replace(/\.\w+$/, '.mp4')
}

/**
 * Build a cross-platform delivery URL for a voice note. Browsers record in
 * webm/opus (Chrome/Firefox) or mp4/aac (Safari); forcing `.mp3` + `q_auto`
 * makes Cloudinary transcode to a format that plays everywhere, incl. iOS.
 * Audio is stored under Cloudinary's `video` resource type.
 */
export function cloudinaryAudioUrl(url: string): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url
  return url
    .replace('/upload/', '/upload/q_auto/')
    .replace(/\.\w+$/, '.mp3')
}

export async function cloudinaryUpload(
  file: Blob | File,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and ' +
        'VITE_CLOUDINARY_UPLOAD_PRESET in lm-app/.env.local and restart dev.',
    )
  }

  const resourceType =
    opts.resourceType ??
    (file.type.startsWith('video/') ? 'video' : 'image')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  if (opts.folder)   fd.append('folder', opts.folder)
  if (opts.publicId) fd.append('public_id', opts.publicId)
  if (opts.tags && opts.tags.length) fd.append('tags', opts.tags.join(','))

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`,
    { method: 'POST', body: fd },
  )

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(
      `Cloudinary upload failed (${res.status}). Check your unsigned preset ` +
        `and folder permissions. Server said: ${txt.slice(0, 240)}`,
    )
  }

  const data = await res.json()
  return mapResult(data)
}

function mapResult(data: Record<string, unknown>): UploadResult {
  return {
    url: data.secure_url as string,
    publicId: data.public_id as string,
    format: data.format as string,
    width: data.width as number,
    height: data.height as number,
    duration: data.duration as number | undefined,
    resourceType: data.resource_type as CloudinaryResource,
    bytes: data.bytes as number,
  }
}

/**
 * Chunked unsigned upload for large files (the big-video fallback, when we
 * couldn't trim client-side). Cloudinary's single-POST unsigned upload caps
 * around 100 MB; chunking with Content-Range lifts that. `onProgress` is
 * 0..1 across the whole file.
 */
export async function cloudinaryUploadLarge(
  file: File,
  opts: UploadOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) throw new Error('Cloudinary is not configured.')

  const resourceType = opts.resourceType ?? (file.type.startsWith('video/') ? 'video' : 'image')
  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`
  const CHUNK = 6 * 1024 * 1024
  const uploadId = crypto.randomUUID().replace(/-/g, '')
  let start = 0
  let last: Record<string, unknown> | null = null

  while (start < file.size) {
    const end = Math.min(start + CHUNK, file.size)
    const chunk = file.slice(start, end)
    const fd = new FormData()
    fd.append('file', chunk)
    fd.append('upload_preset', preset)
    if (opts.folder) fd.append('folder', opts.folder)
    if (opts.tags?.length) fd.append('tags', opts.tags.join(','))

    const res = await fetch(endpoint, {
      method: 'POST',
      body: fd,
      headers: {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Upload failed (${res.status}). ${txt.slice(0, 200)}`)
    }
    last = await res.json()
    start = end
    onProgress?.(Math.min(1, start / file.size))
  }
  if (!last) throw new Error('Upload produced no result')
  return mapResult(last)
}
