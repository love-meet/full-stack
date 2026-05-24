import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { FeedPost } from '../hooks/useFeed'
import {
  useToggleBookmark,
  useMuteUser,
  useBlockUser,
} from '../hooks/usePostActions'
import { useDeletePost, useUpdatePost } from '../hooks/usePostMutations'
import EditCaptionSheet from './EditCaptionSheet'
import ReportSheet from './ReportSheet'
import ConfirmDialog from './ConfirmDialog'
import { getSurface } from '../lib/surface'

type Props = {
  post: FeedPost
  isMine: boolean
  /** The ⋯ button — the panel positions itself under it and ignores its clicks. */
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

const PANEL_W = 240
const EST_PANEL_H = 300

type Item = {
  icon: string
  label: string
  destructive?: boolean
  onClick: () => void | Promise<void>
}
type Inner = 'edit' | 'report' | null
type Confirm = 'delete' | 'block' | null

/**
 * The post ⋯ menu as an anchored dropdown (not a bottom-sheet). Render it
 * inside a `relative` container next to the ⋯ button — it positions itself
 * top-right. A transparent full-screen layer catches outside clicks.
 *
 * Edit-caption / report still open as their own focused sheets (they're
 * forms); destructive actions confirm via ConfirmDialog.
 */
export default function PostMoreDropdown({ post, isMine, anchorRef, onClose }: Props) {
  const bookmark = useToggleBookmark()
  const updatePost = useUpdatePost()
  const deletePost = useDeletePost()
  const mute = useMuteUser()
  const block = useBlockUser()

  const [inner, setInner] = useState<Inner>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Position the panel under the anchor button (flips above near the bottom).
  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom + 6
    const flip = below + EST_PANEL_H > window.innerHeight && r.top - EST_PANEL_H > 0
    setPos({
      top: flip ? Math.max(8, r.top - EST_PANEL_H - 6) : below,
      right: Math.max(8, window.innerWidth - r.right),
    })
  }, [anchorRef])

  // Close on outside pointer, scroll, resize, or Escape.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    function bye() { onClose() }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', bye, true)
    window.addEventListener('resize', bye)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', bye, true)
      window.removeEventListener('resize', bye)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchorRef, onClose])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function withBusy(label: string, op: () => Promise<unknown>, closeOnDone = false) {
    setBusyLabel(label)
    try {
      await op()
      if (closeOnDone) onClose()
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusyLabel(null)
    }
  }

  const ownItems: Item[] = [
    { icon: '✎', label: 'Edit caption', onClick: () => setInner('edit') },
    {
      icon: post.comments_disabled ? '💬' : '🔇',
      label: post.comments_disabled ? 'Turn on commenting' : 'Turn off commenting',
      onClick: () =>
        withBusy(
          post.comments_disabled ? 'Enabling…' : 'Disabling…',
          () => updatePost.mutateAsync({ postId: post.id, patch: { comments_disabled: !post.comments_disabled } }),
        ).then(() => flash(post.comments_disabled ? 'Commenting on' : 'Commenting off')),
    },
    {
      icon: post.hide_like_count ? '👁' : '🙈',
      label: post.hide_like_count ? 'Show like count' : 'Hide like count',
      onClick: () =>
        withBusy(
          post.hide_like_count ? 'Showing…' : 'Hiding…',
          () => updatePost.mutateAsync({ postId: post.id, patch: { hide_like_count: !post.hide_like_count } }),
        ).then(() => flash(post.hide_like_count ? 'Likes visible' : 'Likes hidden')),
    },
    { icon: '🔗', label: 'Copy link', onClick: () => copyLink(post.id, flash) },
    { icon: '↗', label: 'Share to Telegram', onClick: () => { shareToTelegram(post); onClose() } },
    { icon: '🗑', label: 'Delete post', destructive: true, onClick: () => setConfirm('delete') },
  ]

  const otherItems: Item[] = [
    {
      icon: post.bookmarked_by_me ? '★' : '☆',
      label: post.bookmarked_by_me ? 'Unsave' : 'Save',
      onClick: () =>
        withBusy(
          post.bookmarked_by_me ? 'Unsaving…' : 'Saving…',
          () => bookmark.mutateAsync({ postId: post.id, nextBookmarked: !post.bookmarked_by_me }),
        ).then(() => flash(post.bookmarked_by_me ? 'Removed from saved' : 'Saved')),
    },
    { icon: '🔗', label: 'Copy link', onClick: () => copyLink(post.id, flash) },
    { icon: '↗', label: 'Share to Telegram', onClick: () => { shareToTelegram(post); onClose() } },
    {
      icon: '🔕',
      label: `Mute @${authorLabel(post)}`,
      onClick: () => withBusy('Muting…', () => mute.mutateAsync(post.author_id), true).then(() => flash('Muted')),
    },
    { icon: '🚫', label: `Block @${authorLabel(post)}`, destructive: true, onClick: () => setConfirm('block') },
    { icon: '⚠', label: 'Report post', destructive: true, onClick: () => setInner('report') },
  ]

  const items = isMine ? ownItems : otherItems

  return (
    <>
      {/* Panel — portaled to <body> so card overflow/stacking can't clip it,
          positioned fixed under the ⋯ button. */}
      {inner === null && pos && createPortal(
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, width: PANEL_W }}
          className="z-[80] origin-top-right glass rounded-2xl p-1.5 shadow-2xl border border-white/10"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={it.onClick}
              disabled={!!busyLabel}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors',
                busyLabel ? 'opacity-60 cursor-wait' : 'hover:bg-white/[0.06]',
                it.destructive ? 'text-danger' : 'text-ink',
              ].join(' ')}
            >
              <span className="text-base w-5 text-center shrink-0">{it.icon}</span>
              <span className="font-semibold truncate">{it.label}</span>
            </button>
          ))}
        </motion.div>,
        document.body,
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] glass rounded-full px-4 py-2 text-sm text-ink pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nested sheets (forms) */}
      {inner === 'edit' && (
        <EditCaptionSheet
          postId={post.id}
          initialCaption={post.caption}
          onClose={() => { setInner(null); onClose() }}
        />
      )}
      {inner === 'report' && (
        <ReportSheet postId={post.id} onClose={() => { setInner(null); onClose() }} />
      )}

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this post?"
        message="This can't be undone. All likes, comments, and gifts on it will go with it."
        confirmLabel="Delete"
        destructive
        busy={busyLabel === 'Deleting…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await withBusy('Deleting…', () => deletePost.mutateAsync(post.id), true)
        }}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        title={`Block @${authorLabel(post)}?`}
        message="You won't see their posts anymore. They won't be notified."
        confirmLabel="Block"
        destructive
        busy={busyLabel === 'Blocking…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await withBusy('Blocking…', () => block.mutateAsync(post.author_id), true)
        }}
      />
    </>
  )
}

function authorLabel(post: FeedPost): string {
  return post.author_handle ?? post.author_display_name ?? 'user'
}

async function copyLink(postId: string, flash: (msg: string) => void) {
  const url = `${window.location.origin}/p/${postId}`
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } else {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      flash('Link copied')
    }
  } catch {
    flash('Could not copy')
  }
}

function shareToTelegram(post: FeedPost) {
  const url = `${window.location.origin}/p/${post.id}`
  const text = post.caption
    ? `“${post.caption.slice(0, 100)}” — @${post.author_handle ?? 'someone'} on Love meet`
    : `Look at this on Love meet`
  if (getSurface() === 'telegram' && window.Telegram?.WebApp) {
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    const wa = window.Telegram.WebApp as unknown as { openTelegramLink?: (s: string) => void }
    if (wa.openTelegramLink) { wa.openTelegramLink(share); return }
  }
  if (navigator.share) { void navigator.share({ url, text }).catch(() => {}); return }
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
}
