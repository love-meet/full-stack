import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useConversations } from '../hooks/useConversations'
import { useStartDM } from '../hooks/useStartDM'
import { useRelations } from '../hooks/useFollow'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { getSurface } from '../lib/surface'
import { avatarUrlOr } from '../lib/avatar'

const MORE_PEOPLE_LIMIT = 30

/** A minimal "person row" the share sheet renders. */
type Contact = {
  id: string                 // user id (the recipient)
  conversationId: string | null // existing DM, if any
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

/**
 * Share a link (e.g. a game invite). Sends to a conversation directly when one
 * exists, or opens a new DM and sends. Contacts are bucketed: Friends
 * (followed) → Recent chats → More people (other users on the platform).
 */
export default function ShareSheet({ url, text, title = 'Share', onClose }: {
  url: string
  text: string
  title?: string
  onClose: () => void
}) {
  useDrawerLock()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const convs = useConversations()
  const startDM = useStartDM()
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Contacts pulled from existing conversations (Friends + Other chats).
  // Skip rows with no usable name — these are anonymous guest accounts (game
  // joins) or profiles that never finished onboarding; rendering them as
  // "unknown" is just noise.
  const chatContacts: Contact[] = useMemo(() => {
    return (convs.data ?? [])
      .filter((c) => c.other_id && (c.other_handle || c.other_display_name))
      .map((c) => ({
        id: c.other_id!,
        conversationId: c.id,
        handle: c.other_handle,
        displayName: c.other_display_name,
        avatarUrl: c.other_avatar_url,
      }))
  }, [convs.data])

  const chatIds = chatContacts.map((c) => c.id)
  const relations = useRelations(chatIds)
  const friends = chatContacts.filter((c) => relations.data?.get(c.id)?.is_following)
  const otherChats = chatContacts.filter((c) => !relations.data?.get(c.id)?.is_following)

  // "More people" — recent profiles I haven't already chatted with.
  const more = useQuery<Contact[]>({
    queryKey: ['share-sheet-people', myId, chatIds.join(',')],
    enabled: !!myId,
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url, created_at')
        .neq('id', myId!)
        .is('deleted_at', null)
        // Only profiles that actually have something to display — drops
        // anonymous game-guest accounts and half-onboarded profiles.
        .or('handle.not.is.null,display_name.not.is.null')
        .order('created_at', { ascending: false })
        .limit(MORE_PEOPLE_LIMIT)
      const excludeIds = chatIds.length ? chatIds : ['00000000-0000-0000-0000-000000000000']
      q = q.not('id', 'in', `(${excludeIds.join(',')})`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id as string,
        conversationId: null,
        handle: (r as { handle: string | null }).handle ?? null,
        displayName: (r as { display_name: string | null }).display_name ?? null,
        avatarUrl: (r as { avatar_url: string | null }).avatar_url ?? null,
      }))
    },
  })

  async function send(target: Contact) {
    if (!myId) return
    const key = target.id
    setBusy(key)
    try {
      let convoId = target.conversationId
      if (!convoId) convoId = await startDM.mutateAsync(target.id)
      const { error } = await supabase.from('messages')
        .insert({ conversation_id: convoId, sender_id: myId, body: text })
      if (error) throw error
      setSent((s) => ({ ...s, [key]: true }))
    } catch { /* ignore — user can retry */ }
    finally { setBusy(null) }
  }

  function toTelegram() {
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    if (getSurface() === 'telegram' && window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp as unknown as { openTelegramLink?: (s: string) => void }
      if (wa.openTelegramLink) { wa.openTelegramLink(share); return }
    }
    window.open(share, '_blank')
  }
  function nativeShare() { if (navigator.share) void navigator.share({ title, text, url }).catch(() => {}) }
  function copy() {
    void navigator.clipboard?.writeText(url)
    setFlash('Link copied')
    window.setTimeout(() => setFlash(null), 1500)
  }

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose() }} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-xl bg-surface-2 rounded-t-3xl flex flex-col outline-none"
          style={{ maxHeight: '82dvh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="pt-3 pb-1 shrink-0"><div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" /></div>
          <Drawer.Title className="px-5 pt-2 text-lg font-extrabold text-ink">{title}</Drawer.Title>

          <div className="px-5 mt-3 flex gap-2 shrink-0">
            <button onClick={copy} className="flex-1 rounded-full py-2.5 text-sm font-bold glass text-ink-2 hover:text-ink">⧉ Copy link</button>
            <button onClick={toTelegram} className="flex-1 rounded-full py-2.5 text-sm font-bold bg-coral/20 text-coral">✈ Telegram</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button onClick={nativeShare} className="flex-1 rounded-full py-2.5 text-sm font-bold glass text-ink-2 hover:text-ink">More…</button>
            )}
          </div>
          {flash && <p className="px-5 mt-2 text-xs text-success">{flash}</p>}

          <div className="overflow-y-auto no-scrollbar">
            {friends.length > 0 && (
              <Section title="Friends">
                {friends.map((c) => <Row key={c.id} c={c} busy={busy} sent={sent} onSend={send} />)}
              </Section>
            )}
            {otherChats.length > 0 && (
              <Section title="Recent chats">
                {otherChats.map((c) => <Row key={c.id} c={c} busy={busy} sent={sent} onSend={send} />)}
              </Section>
            )}
            <Section title="More people">
              {more.status === 'pending' && (
                <li className="px-2 py-3 text-xs text-ink-muted">Loading…</li>
              )}
              {more.status === 'success' && more.data.length === 0 && friends.length + otherChats.length === 0 && (
                <li className="px-2 py-4 text-sm text-ink-muted">No contacts yet — copy the link or share via Telegram above.</li>
              )}
              {(more.data ?? []).map((c) => <Row key={c.id} c={c} busy={busy} sent={sent} onSend={send} />)}
            </Section>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="px-5 mt-4 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">{title}</div>
      <ul className="px-3 mt-1">{children}</ul>
    </>
  )
}

function Row({
  c, busy, sent, onSend,
}: { c: Contact; busy: string | null; sent: Record<string, boolean>; onSend: (c: Contact) => void }) {
  const label = c.handle ? `@${c.handle}` : c.displayName ?? 'unknown'
  const isBusy = busy === c.id
  const isSent = !!sent[c.id]
  return (
    <li className="flex items-center gap-3 px-2 py-2">
      <img src={avatarUrlOr(c.avatarUrl)} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      <span className="flex-1 text-sm text-ink truncate">{label}</span>
      <button
        onClick={() => onSend(c)}
        disabled={isBusy || isSent}
        className={[
          'rounded-full px-4 py-1.5 text-xs font-bold',
          isSent ? 'bg-success/15 text-success' : 'bg-gradient-brand text-white',
        ].join(' ')}
      >
        {isSent ? 'Sent ✓' : isBusy ? '…' : 'Send'}
      </button>
    </li>
  )
}
