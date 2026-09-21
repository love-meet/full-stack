import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { cloudinaryUpload } from '../lib/cloudinary'
import type { Profile } from './useProfile'

const MAX_BYTES = 6 * 1024 * 1024 // 6 MB

export const GALLERY_MAX = 5

/**
 * Gallery photos — optional, added from Profile whenever the user feels like
 * it, never a gate (§4).
 *
 * The cap and the "newest replaces oldest" rule live in add_gallery_photo()
 * (migration 0090), not here: two devices adding a photo at once would
 * otherwise race past five. This hook just uploads and calls it.
 */
export function useAddGalleryPhoto() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<string[]> => {
      if (!session) throw new Error('not signed in')
      if (file.size > MAX_BYTES) {
        throw new Error(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 6 MB.`)
      }
      if (!file.type.startsWith('image/')) throw new Error('Please pick an image file.')

      const uploaded = await cloudinaryUpload(file, {
        folder: `lm-app/gallery/${session.user.id}`,
        resourceType: 'image',
        tags: ['gallery'],
      })
      const { data, error } = await supabase.rpc('add_gallery_photo', { url: uploaded.url })
      if (error) throw error
      return (data ?? []) as string[]
    },
    onSuccess: (urls) => patchCachedGallery(qc, session?.user.id ?? null, urls),
  })
}

export function useRemoveGalleryPhoto() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (url: string): Promise<string[]> => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase.rpc('remove_gallery_photo', { url })
      if (error) throw error
      return (data ?? []) as string[]
    },
    onSuccess: (urls) => patchCachedGallery(qc, session?.user.id ?? null, urls),
  })
}

/** Keep the cached profile in step with what the RPC returned. */
function patchCachedGallery(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null,
  urls: string[],
) {
  qc.setQueryData<Profile | null>(['profile', userId], (p) =>
    p ? { ...p, gallery_urls: urls } : p,
  )
}
