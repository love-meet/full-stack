import { useState } from 'react'
import { useProfile } from '../../hooks/useProfile'
import { avatarFor } from '../../lib/avatar'
import CroppedImage from './CroppedImage'
import type { Media } from './types'

type Props = {
  media: Media
  caption: string
  onChangeCaption: (v: string) => void
  hideLikeCount: boolean
  onChangeHideLikeCount: (v: boolean) => void
  commentsDisabled: boolean
  onChangeCommentsDisabled: (v: boolean) => void
  altText: string
  onChangeAltText: (v: string) => void
  error: string | null
}

export default function ComposeStep({
  media,
  caption,
  onChangeCaption,
  hideLikeCount,
  onChangeHideLikeCount,
  commentsDisabled,
  onChangeCommentsDisabled,
  altText,
  onChangeAltText,
  error,
}: Props) {
  const profile = useProfile()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Pin thumbnail height to 96 px; width follows the cropped area's aspect,
  // clamped so very tall crops don't shrink to a sliver.
  const thumbHeight = 96
  const cropRatio = media.crop
    ? media.crop.width / media.crop.height
    : media.width / media.height
  const thumbWidth = Math.min(120, Math.max(60, Math.round(thumbHeight * cropRatio)))

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <img
          src={avatarFor(profile.data)}
          alt=""
          className="w-9 h-9 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink text-sm truncate">
            @{profile.data?.handle ?? 'you'}
          </div>
        </div>
      </div>

      {/* Caption + thumbnail row */}
      <div className="px-4 py-4 flex gap-3 border-b border-white/5 items-start">
        <textarea
          value={caption}
          onChange={(e) => onChangeCaption(e.target.value)}
          rows={5}
          maxLength={2200}
          placeholder="Write a caption…"
          className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-muted text-base resize-none min-w-0"
        />
        <div
          className="shrink-0 rounded-lg overflow-hidden bg-surface-3"
          style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
        >
          {media.kind === 'image' ? (
            <CroppedImage
              src={media.previewUrl}
              naturalWidth={media.width}
              naturalHeight={media.height}
              area={media.crop}
              filter={media.filter.css === 'none' ? undefined : media.filter.css}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <video
              src={media.previewUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          )}
        </div>
      </div>

      <div className="text-right text-[11px] text-ink-muted px-4 pt-1">
        {caption.length}/2200
      </div>

      {/* Settings rows */}
      <ul className="px-2 mt-2">
        <SettingsRow icon="👤" label="Tag people" rightHint="Coming soon" disabled />
        <SettingsRow icon="📍" label="Add location" rightHint="Coming soon" disabled />
        <SettingsRow icon="🎵" label="Add music" rightHint="Coming soon" disabled />
        <SettingsRow
          icon="⚙"
          label="Advanced settings"
          rightHint={advancedOpen ? '▴' : '▾'}
          onClick={() => setAdvancedOpen((o) => !o)}
        />
        {advancedOpen && (
          <li className="px-4 pt-3 pb-2 space-y-3">
            <ToggleRow
              title="Hide like count on this post"
              subtitle="Only you will see the total number of likes."
              value={hideLikeCount}
              onChange={onChangeHideLikeCount}
            />
            <ToggleRow
              title="Turn off commenting"
              subtitle="Stops new comments without removing existing ones."
              value={commentsDisabled}
              onChange={onChangeCommentsDisabled}
            />
            <AltTextField value={altText} onChange={onChangeAltText} />
          </li>
        )}
      </ul>

      {error && <p className="text-sm text-danger px-5 mt-3">{error}</p>}

      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

function SettingsRow({
  icon,
  label,
  rightHint,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  rightHint?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04]',
        ].join(' ')}
      >
        <span className="text-lg w-6 text-center">{icon}</span>
        <span className="flex-1 text-ink font-medium">{label}</span>
        {rightHint && <span className="text-xs text-ink-muted">{rightHint}</span>}
      </button>
    </li>
  )
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full glass rounded-2xl px-4 py-3 flex items-center justify-between text-left hover:text-ink transition-colors"
    >
      <div className="min-w-0 pr-3">
        <div className="text-ink font-semibold text-sm">{title}</div>
        {subtitle && <div className="text-xs text-ink-muted mt-0.5">{subtitle}</div>}
      </div>
      <span
        className={[
          'relative h-6 w-11 rounded-full transition-colors shrink-0',
          value ? 'bg-gradient-brand glow-rose' : 'bg-surface-3',
        ].join(' ')}
        aria-hidden
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

function AltTextField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="glass rounded-2xl px-4 py-3 block">
      <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
        Alt text
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        placeholder="Describe the photo for people who can't see it."
        className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-sm"
      />
      <div className="text-right text-[10px] text-ink-muted mt-1">
        {value.length}/200
      </div>
    </label>
  )
}
