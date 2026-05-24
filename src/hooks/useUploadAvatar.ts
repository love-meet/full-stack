import { useMutation } from '@tanstack/react-query'
import { cloudinaryUpload } from '../lib/cloudinary'
import { useAuth } from '../stores/auth'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB; avatar shouldn't need more

/** Uploads a single avatar image to Cloudinary and returns its secure URL. */
export function useUploadAvatar() {
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!session) throw new Error('not signed in')
      if (file.size > MAX_BYTES) {
        throw new Error(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 4 MB.`)
      }
      if (!file.type.startsWith('image/')) {
        throw new Error('Please pick an image file.')
      }
      const r = await cloudinaryUpload(file, {
        folder: `lm-app/avatars/${session.user.id}`,
        resourceType: 'image',
        tags: ['avatar'],
      })
      return r.url
    },
  })
}
