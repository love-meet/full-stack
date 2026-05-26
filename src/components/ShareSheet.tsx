import { useState } from 'react'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useConversations } from '../hooks/useConversations'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { getSurface } from '../lib/surface'
import { avatarUrlOr } from '../lib/avatar'

/**
 * Share a link (e.g. a game invite): copy, send to Telegram, native share, or
 * send straight into one of the user's chat conversations.
 */
export default function ShareSheet({ url, text, title = 'Share', onClose }: {
  url: string
  text: string
  title?: string
  onClose: () => void
}) {
  useDrawerLock()
  const convs = useConversations()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  async function sendToChat(conversationId: string) {
    if (!myId) return
    setBusy(conversationId)
    try {
      const { error } = await supabase.from('messages')
        .insert({ conversation_id: conversationId, sender_id: myId, body: text })
      if (error) throw error
      setSent((s) => ({ ...s, [conversationId]: true }))
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

  const items = convs.data ?? []

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

          <div className="px-5 mt-4 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold shrink-0">Send to a chat</div>
          <ul className="px-3 mt-1 overflow-y-auto no-scrollbar">
            {convs.status === 'success' && items.length === 0 && (
              <li className="px-2 py-4 text-sm text-ink-muted">No conversations yet.</li>
            )}
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-2 py-2">
                <img src={avatarUrlOr(c.other_avatar_url)} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                <span className="flex-1 text-sm text-ink truncate">@{c.other_handle ?? c.other_display_name ?? 'unknown'}</span>
                <button
                  onClick={() => sendToChat(c.id)}
                  disabled={busy === c.id || sent[c.id]}
                  className={[
                    'rounded-full px-4 py-1.5 text-xs font-bold',
                    sent[c.id] ? 'bg-success/15 text-success' : 'bg-gradient-brand text-white',
                  ].join(' ')}
                >
                  {sent[c.id] ? 'Sent ✓' : busy === c.id ? '…' : 'Send'}
                </button>
              </li>
            ))}
          </ul>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
