import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type SavedPost = {
  id: string
  media_url: string | null
  kind: 'image' | 'video' | null
  caption: string | null
  saved_at: string
}

type RawSaved = {
  created_at: string
  post: {
    id: string
    media_url: string | null
    kind: 'image' | 'video' | null
    caption: string | null
  } | null
}

/** Posts the signed-in user has bookmarked, newest-saved first. */
export function useBookmarkedPosts() {
  const session = useAuth((s) => s.session)
  return useQuery<SavedPost[]>({
    queryKey: ['saved_posts', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_bookmarks')
        .select('created_at, post:posts!post_id(id, media_url, kind, caption)')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return ((data ?? []) as unknown as RawSaved[])
        .filter((r) => r.post)
        .map((r) => ({
          id: r.post!.id,
          media_url: r.post!.media_url,
          kind: r.post!.kind,
          caption: r.post!.caption,
          saved_at: r.created_at,
        }))
    },
  })
}
