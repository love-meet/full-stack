import { useMutation } from '@tanstack/react-query'
import { cloudinaryAudioUrl, cloudinaryUpload, type UploadResult } from '../lib/cloudinary'
import { useAuth } from '../stores/auth'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024   // 8 MB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024  // 40 MB — short clips only
const MAX_AUDIO_BYTES = 16 * 1024 * 1024  // 16 MB — voice notes

export type ChatMediaUpload = {
  url: string
  kind: 'image' | 'video' | 'audio'
  aspect: number   // width / height — used to size the bubble before the asset paints
  /** Clip length in seconds, when known (voice notes / video). */
  duration?: number
}

/**
 * Uploads a single attachment for a chat message. Caller pre-picks
 * file via the composer's file input; this just enforces size + type
 * and routes to Cloudinary.
 */
export function useUploadChatMedia() {
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (file: File): Promise<ChatMediaUpload> => {
      if (!session) throw new Error('not signed in')

      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/')
      if (!isVideo && !isImage && !isAudio) {
        throw new Error('Pick an image, video, or voice note.')
      }

      const cap = isVideo ? MAX_VIDEO_BYTES : isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
      if (file.size > cap) {
        const mb = (cap / 1024 / 1024).toFixed(0)
        const label = isVideo ? 'video' : isAudio ? 'voice note' : 'image'
        throw new Error(`File is too large — max ${mb} MB for ${label}.`)
      }

      const r: UploadResult = await cloudinaryUpload(file, {
        folder: `lm-app/chat/${session.user.id}`,
        // Cloudinary stores audio under its `video` resource type.
        resourceType: isImage ? 'image' : 'video',
        tags: ['chat'],
      })

      const kind = isVideo ? 'video' : isAudio ? 'audio' : 'image'
      return {
        url: isAudio ? cloudinaryAudioUrl(r.url) : r.url,
        kind,
        aspect: r.height > 0 ? r.width / r.height : 1,
        duration: r.duration,
      }
    },
  })
}
