import { useMutation } from '@tanstack/react-query'
import { cloudinaryUpload } from '../lib/cloudinary'
import { useAuth } from '../stores/auth'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

/** Uploads a single profile-gallery photo to Cloudinary and returns its secure URL. */
export function useUploadGalleryPhoto() {
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!session) throw new Error('not signed in')
      if (file.size > MAX_BYTES) {
        throw new Error(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 8 MB.`)
      }
      if (!file.type.startsWith('image/')) {
        throw new Error('Please pick an image file.')
      }
      const r = await cloudinaryUpload(file, {
        folder: `lm-app/gallery/${session.user.id}`,
        resourceType: 'image',
        tags: ['gallery'],
      })
      return r.url
    },
  })
}
