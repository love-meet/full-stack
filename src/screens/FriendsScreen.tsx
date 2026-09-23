import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopIcons from '../shell/TopIcons'
import { useFriends, useRemoveFriend, isOnline, type Friend } from '../hooks/useFriends'
import { useStartDM, isDailyChatLimit } from '../hooks/useStartDM'
import { ageFrom } from '../hooks/usePeopleFeed'
import { avatarUrlOr } from '../lib/avatar'

/**
 * Friends (HS-LM-v1 §05).
 *
 * "Everyone you said you were interested in, and everyone who said it about
 * you. There is nothing else to collect in this app."
 *
 * A list of people, not a feed of posts — this is where you decide who to
 * talk to. Online status appears here and nowhere else, because §05 is
 * explicit about why: on a friends list it helps you choose, whereas on a
 * profile or a chat it is just something to watch anxiously.
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

      <main className="max-w-2xl mx-auto px-4 py-4">
        {friends.status === 'pending' && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[4.5rem] rounded-2xl bg-white/8 animate-pulse" />
            ))}
          </div>
        )}

        {friends.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
            {(friends.error as Error).message}
          </div>
        )}

        {friends.status === 'success' && list.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-5xl mb-3">🤝</div>
            <p className="font-semibold mb-1">Nobody yet</p>
            <p className="text-sm text-ink-2 leading-relaxed">
              Tap <b className="text-ink">Interested</b> on someone in your{' '}
              <Link to="/feed" className="text-rose font-semibold hover:underline">feed</Link>.
              They land here straight away — you don't have to wait for them to
              choose you back.
            </p>
          </div>
        )}

        <ul className="space-y-1.5">
          {list.map((f) => <FriendRow key={f.id} friend={f} />)}
        </ul>
      </main>
    </div>
  )
}

function FriendRow({ friend: f }: { friend: Friend }) {
  const navigate = useNavigate()
  const startDM = useStartDM()
  const remove = useRemoveFriend()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const name = f.display_name ?? f.handle ?? 'Someone'
  const age = ageFrom(f.dob)
  const online = isOnline(f.last_seen_at)
  // Someone who chose you but has not been chosen back is the one worth
  // opening — so say so, rather than leaving the list uniform.
  const theirMove = f.they_said_it && !f.i_said_it

  async function open() {
    setError(null)
    if (f.conversation_id) { navigate(`/chat/${f.conversation_id}`); return }
    try {
      navigate(`/chat/${await startDM.mutateAsync(f.id)}`)
    } catch (e) {
      setError(isDailyChatLimit(e) ? "That's 20 new chats today." : 'Could not open that chat.')
    }
  }

  return (
    <li className="glass rounded-2xl px-3 py-3">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${f.id}`} className="relative shrink-0">
          <img
            src={avatarUrlOr(f.avatar_url, f.gender)}
            alt=""
            className="w-12 h-12 rounded-full object-cover"
          />
          {online && (
            <span
              aria-label="Online"
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success ring-2 ring-surface-2"
            />
          )}
        </Link>

        <button onClick={open} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate">{name}</span>
            {age != null && <span className="text-sm text-ink-muted">{age}</span>}
            {theirMove && (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 bg-rose/15 text-rose text-[10px] font-bold uppercase tracking-wide">
                Interested in you
              </span>
            )}
          </span>
          <span className="block text-xs text-ink-muted truncate">
            {f.status_line || (online ? 'Online now' : [f.city, f.country_name].filter(Boolean).join(', '))}
          </span>
        </button>

        <button
          onClick={open}
          disabled={startDM.isPending}
          className="shrink-0 rounded-full px-4 py-2 bg-gradient-brand text-white text-xs font-extrabold disabled:opacity-60"
        >
          {startDM.isPending ? '…' : 'Chat'}
        </button>

        <button
          onClick={() => setConfirming((c) => !c)}
          aria-label={`Remove ${name}`}
          className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-ink-muted hover:text-ink"
        >
          ⋯
        </button>
      </div>

      {/* Removing someone is quiet and mutual — it takes you off their list
          too. Worth one confirmation, since there is no undo beyond finding
          them again. */}
      {confirming && (
        <div className="mt-2 pt-2 border-t border-white/8 flex items-center gap-2">
          <p className="flex-1 text-xs text-ink-muted">
            Remove {name}? You'll come off each other's lists. They aren't told.
          </p>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-ink-2"
          >
            Keep
          </button>
          <button
            onClick={() => remove.mutate(f.id)}
            disabled={remove.isPending}
            className="rounded-full px-3 py-1.5 bg-danger/15 text-danger text-xs font-bold disabled:opacity-60"
          >
            {remove.isPending ? '…' : 'Remove'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </li>
  )
}
