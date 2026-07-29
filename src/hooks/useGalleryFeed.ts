import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type GalleryCandidate = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  gender: 'female' | 'male' | 'nonbinary' | 'other' | 'prefer_not_to_say' | null
  country_code: string | null
  gallery_urls: string[]
  age: number | null
}

/** A row from get_my_interests() — backs the Interested tab. */
export type InterestRow = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  country_code: string | null
  gallery_urls: string[]
  age: number | null
  interested_at: string
  is_match: boolean
  conversation_id: string | null
}

const BATCH_SIZE = 10
// Fetch another batch once the queue gets this low, so the next card is
// (usually) already in hand by the time the user reaches it.
const REFILL_THRESHOLD = 3

/**
 * The gallery discovery feed. Each call to get_gallery_feed() atomically
 * records the batch as "viewed" server-side (see 0097_gallery_matching.sql),
 * so this can't use react-query's normal infinite-query/refetch model —
 * calling it again with the "same" params returns DIFFERENT candidates by
 * design. Plain local state instead, refilled as the queue runs low.
 */
export function useGalleryFeed() {
  const session = useAuth((s) => s.session)
  const [cards, setCards] = useState<GalleryCandidate[]>([])
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [error, setError] = useState<Error | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const fetching = useRef(false)

  const fetchMore = useCallback(async () => {
    if (!session || fetching.current || exhausted) return
    fetching.current = true
    try {
      const { data, error: rpcError } = await supabase.rpc('get_gallery_feed', { p_limit: BATCH_SIZE })
      if (rpcError) throw rpcError
      const batch = (data ?? []) as GalleryCandidate[]
      if (batch.length === 0) setExhausted(true)
      setCards((prev) => [...prev, ...batch])
      setStatus('success')
      setError(null)
    } catch (e) {
      // Note: consumers must treat 'error' as fatal only when `cards` is
      // empty — a failed BACKGROUND refill while cards remain should leave
      // the feed swipeable (FeedScreen guards on cards.length === 0), and a
      // later successful refill flips status back to 'success'.
      setError(e as Error)
      setStatus('error')
    } finally {
      fetching.current = false
    }
  }, [session, exhausted])

  // set-state-in-effect is a false positive on both effects below: fetchMore
  // is async — its state updates land after the RPC resolves, never
  // synchronously in the effect body. (react-query can't be used here; see
  // the hook's doc comment.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cards.length <= REFILL_THRESHOLD) void fetchMore()
  }, [cards.length, fetchMore])

  const consume = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const retry = useCallback(() => {
    setStatus('pending')
    setError(null)
    void fetchMore()
  }, [fetchMore])

  return { cards, status, error, consume, retry, isExhausted: exhausted && cards.length === 0 }
}

export function useRecordGalleryDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ targetId, decision }: { targetId: string; decision: 'interested' | 'passed' }) => {
      const { error } = await supabase.rpc('record_gallery_decision', { p_target_id: targetId, p_decision: decision })
      if (error) throw error
    },
    // An "interested" decision adds a row to the Interested tab — and can
    // create a match (mutual), which also adds a conversation.
    onSuccess: (_d, vars) => {
      if (vars.decision !== 'interested') return
      void qc.invalidateQueries({ queryKey: ['my-interests'] })
      void qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

/** People whose gallery I marked Interested in — newest first. */
export function useMyInterests() {
  const session = useAuth((s) => s.session)
  return useQuery<InterestRow[]>({
    queryKey: ['my-interests'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_interests')
      if (error) throw error
      return (data ?? []) as InterestRow[]
    },
  })
}
