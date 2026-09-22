import type { Trim } from './types'

type CaptureVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

function pickMime(): string | undefined {
  const cands = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return undefined
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve() }
    v.addEventListener('seeked', onSeeked)
    try { v.currentTime = t } catch { resolve() }
    window.setTimeout(resolve, 2000)
  })
}

/**
 * Re-record just the trimmed [start,end] window of a local video into a
 * small, compressed clip — so we upload only the cropped part, never the
 * full source. Works by playing the segment through the element's
 * captureStream() into a MediaRecorder (real-time, ≤60s).
 *
 * Returns null when the browser can't do this (no captureStream, or the
 * source codec won't decode — e.g. HEVC .mov outside Safari); the caller
 * then falls back to uploading the full file + server-side trim.
 */
export async function extractTrimmedClip(
  file: File,
  trim: Trim,
): Promise<{ blob: Blob; type: string } | null> {
  if (typeof MediaRecorder === 'undefined') return null
  const url = URL.createObjectURL(file)
  const v = document.createElement('video') as CaptureVideo
  v.src = url
  v.muted = false
  v.volume = 0           // capture audio track, but play silently
  v.playsInline = true

  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve()
      v.onerror = () => reject(new Error('decode'))
      window.setTimeout(() => reject(new Error('timeout')), 8000)
    })

    const capture = v.captureStream?.bind(v) ?? v.mozCaptureStream?.bind(v)
    if (!capture) return null

    await seek(v, trim.start)
    const stream = capture()
    if (!stream || stream.getVideoTracks().length === 0) return null

    const mime = pickMime()
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 2_500_000, // ~2.5 Mbps → reduced quality/size
    })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve() })

    rec.start(200)
    await v.play().catch(() => { /* gesture should cover this */ })

    await new Promise<void>((resolve) => {
      const onTime = () => {
        if (v.currentTime >= trim.end) {
          v.pause()
          v.removeEventListener('timeupdate', onTime)
          resolve()
        }
      }
      v.addEventListener('timeupdate', onTime)
      // Safety stop in case timeupdate stalls.
      window.setTimeout(() => { v.pause(); resolve() }, (trim.end - trim.start + 2) * 1000)
    })

    rec.stop()
    await stopped
    const type = chunks[0]?.type || mime || 'video/webm'
    const blob = new Blob(chunks, { type })
    return blob.size > 0 ? { blob, type } : null
  } catch {
    return null
  } finally {
    v.pause()
    v.src = ''
    URL.revokeObjectURL(url)
  }
}
