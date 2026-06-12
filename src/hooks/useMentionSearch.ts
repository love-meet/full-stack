import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export type MentionResult = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
}

/**
 * Lightweight debounced mention-search hook.
 * Returns up to 5 matching profiles for a given partial handle/name.
 * Uses the existing searchable_profiles view — no new DB objects needed.
 * `query` should be the raw text after the @ symbol (e.g. "val" from "@val").
 */
export function useMentionSearch(query: string) {
  const [results, setResults] = useState<MentionResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`
        const { data, error } = await supabase
          .from('searchable_profiles')
          .select('id, handle, display_name, avatar_url')
          .or(`handle.ilike.${like},display_name.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(5)
        if (!error) setResults((data ?? []) as MentionResult[])
      } finally {
        setLoading(false)
      }
    }, 200) // 200 ms debounce — snappy but doesn't hammer the DB on every keystroke

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  return { results, loading }
}
