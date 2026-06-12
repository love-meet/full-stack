import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type AudioTrack = {
  id: string
  title: string
  artist: string
  audio_url: string
  cover_url: string | null
  duration_sec: number | null
  genre: string | null
}

/** Fetches the full curated track library. Small enough for a single query;
 *  cached for the session so the picker opens instantly on repeat opens. */
export function useAudioTracks() {
  return useQuery<AudioTrack[]>({
    queryKey: ['audio-tracks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('id, title, artist, audio_url, cover_url, duration_sec, genre')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AudioTrack[]
    },
    staleTime: 1000 * 60 * 30, // 30 min — library changes rarely
  })
}
