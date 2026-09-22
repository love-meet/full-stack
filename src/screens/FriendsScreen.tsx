import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import TopIcons from '../shell/TopIcons'
import { useFriends, type Friend } from '../hooks/useFriends'
import { useStartDM, isDailyChatLimit } from '../hooks/useStartDM'
import { ageFrom } from '../hooks/usePeopleFeed'
import { avatarUrlOr } from '../lib/avatar'
import { useState } from 'react'

/**
 * Friends — the second tab, where Search used to sit.
 *
 * This is your people only: mutual matches, nobody else. The main feed is for
 * meeting strangers; this is for the ones you already connected with, so it is
 * a scannable grid rather than one-face-per-screen — you come here knowing who
 * you are looking for.
 *
 * Search is still reachable at /search (the empty state links to it); it just
 * no longer owns a tab.
 */
export default function FriendsScreen() {
  const friends = useFriends()
  const list = friends.data ?? []

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="font-extrabold text-lg tracking-tight">
            Friends
            {list.length > 0 && (
              <span className="ml-2 text-sm font-bold text-ink-muted tabular-nums">{list.length}</span>
            )}
          </h1>
          <TopIcons />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {friends.status === 'pending' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-white/8 animate-pulse" />
            ))}
          </div>
        )}

        {friends.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
            Couldn't load your friends: {(friends.error as Error).message}
          </div>
        )}

        {friends.status === 'success' && list.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-5xl mb-3">🤝</div>
            <p className="font-semibold mb-1">No friends yet</p>
            <p className="text-sm text-ink-2 leading-relaxed">
              Like someone in your{' '}
              <Link to="/feed" className="text-rose font-semibold hover:underline">feed</Link>.
              When they like you back, they land here.
            </p>
            <Link
              to="/search"
              className="mt-5 inline-block rounded-full px-6 py-2.5 glass text-sm font-bold"
            >
              Search for someone
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((f) => <FriendCard key={f.id} friend={f} />)}
        </div>
      </main>
    </div>
  )
}

function FriendCard({ friend }: { friend: Friend }) {
  const navigate = useNavigate()
  const startDM = useStartDM()
  const [error, setError] = useState<string | null>(null)
  const name = friend.display_name ?? friend.handle ?? 'Someone'
  const age = ageFrom(friend.dob)

  async function message() {
    setError(null)
    // A friend usually already has a conversation from the match — jump
    // straight into it and skip the round-trip.
    if (friend.conversation_id) { navigate(`/chat/${friend.conversation_id}`); return }
    try {
      navigate(`/chat/${await startDM.mutateAsync(friend.id)}`)
    } catch (e) {
      setError(isDailyChatLimit(e) ? "That's 20 new chats today." : 'Could not open that chat.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden bg-black/40"
    >
      <Link to={`/profile/${friend.id}`} className="block aspect-[3/4]">
        <img
          src={avatarUrlOr(friend.avatar_url, friend.gender)}
          alt=""
          className="w-full h-full object-cover"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 to-transparent" />
        <span className="absolute left-2.5 bottom-10 right-2.5 text-white font-bold text-sm truncate drop-shadow">
          {name}{age != null && <span className="font-semibold text-white/75"> {age}</span>}
        </span>
      </Link>
      <button
        onClick={message}
        disabled={startDM.isPending}
        className="absolute left-2.5 right-2.5 bottom-2.5 rounded-full py-1.5 bg-gradient-brand text-white text-xs font-extrabold disabled:opacity-60"
      >
        {startDM.isPending ? 'Opening…' : 'Message'}
      </button>
      {error && (
        <span className="absolute inset-x-0 top-1 text-center text-[10px] text-white bg-black/70 py-0.5">
          {error}
        </span>
      )}
    </motion.div>
  )
}
