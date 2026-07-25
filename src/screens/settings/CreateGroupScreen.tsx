import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCreateGroup } from '../../hooks/useGroupMembership'
import { useUploadAvatar } from '../../hooks/useUploadAvatar'

const MIN_RULE_CHARS = 5

/** Re-number a list of rule bodies as "1. …", "2. …", so gaps from edited
 *  or removed lines don't leave holes in the saved text. */
function renumber(bodies: string[]): string {
  return bodies.map((b, i) => `${i + 1}. ${b}`).join('\n')
}

export default function CreateGroupScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateGroup()
  const uploadAvatar = useUploadAvatar()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const instructionsRef = useRef<HTMLTextAreaElement | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [welcome, setWelcome] = useState('')
  const [instructions, setInstructions] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canCreate = name.trim().length >= 3 && !create.isPending && !uploadAvatar.isPending

  // ----- Auto-numbered rules / instructions -----
  // Seed "1. " the moment the field is focused (empty), and on Enter insert
  // a fresh "\n<next>. " so each rule lands on its own numbered line.
  function seedInstructions() {
    if (instructions.trim() === '') setInstructions('1. ')
  }

  function onInstructionsKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart, selectionEnd, value } = ta

    // Don't advance to the next number unless the current rule is real:
    // it needs at least MIN_RULE_CHARS of actual text (a rule can't be
    // one or two letters). If it's too short, just stay put.
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const nlIdx = value.indexOf('\n', selectionStart)
    const lineEnd = nlIdx === -1 ? value.length : nlIdx
    const currentContent = value.slice(lineStart, lineEnd).replace(/^\s*\d+\.\s*/, '').trim()
    if (currentContent.length < MIN_RULE_CHARS) return

    const before = value.slice(0, selectionStart)
    const after = value.slice(selectionEnd)
    // Next number = highest leading number seen so far + 1.
    const highest = value.split('\n').reduce((max, line) => {
      const m = line.match(/^\s*(\d+)\./)
      return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0)
    const insert = `\n${highest + 1}. `
    const next = (before + insert + after).slice(0, 500)
    setInstructions(next)
    const caret = Math.min((before + insert).length, 500)
    requestAnimationFrame(() => {
      instructionsRef.current?.setSelectionRange(caret, caret)
    })
  }

  // Keep only rules with real content, and require each to be long enough.
  function tidyInstructions(v: string): string | null {
    const lines = v
      .split('\n')
      .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim())
      .filter((l) => l.length > 0)
    return lines.length ? renumber(lines) : null
  }

  // True when every non-empty rule meets the minimum length.
  function instructionsValid(v: string): boolean {
    const contents = v
      .split('\n')
      .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim())
      .filter((l) => l.length > 0)
    return contents.every((c) => c.length >= MIN_RULE_CHARS)
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setAvatarUrl(await uploadAvatar.mutateAsync(file))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submit() {
    if (!canCreate) return
    if (instructions.trim() && !instructionsValid(instructions)) {
      setError(t('groups.ruleMinChars', { count: MIN_RULE_CHARS }))
      return
    }
    setError(null)
    try {
      const group = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        welcome: welcome.trim() || null,
        instructions: tidyInstructions(instructions),
        avatarUrl: avatarUrl || null,
      })
      navigate(`/g/${group.slug}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-28">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{t('groups.createTitle')}</div>
          <button
            onClick={submit}
            disabled={!canCreate}
            className={[
              'text-sm font-bold px-3 py-1.5 rounded-full transition-opacity',
              canCreate ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
            ].join(' ')}
          >
            {create.isPending ? t('groups.creating') : t('groups.create')}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {error && (
          <div className="glass rounded-2xl p-3 text-sm text-danger border border-danger/30">{error}</div>
        )}

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-brand glow-rose grid place-items-center shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">👥</span>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className={[
                'rounded-full px-4 py-2 text-sm font-bold',
                uploadAvatar.isPending ? 'bg-surface-3 text-ink-muted' : 'bg-gradient-brand text-white glow-rose',
              ].join(' ')}
            >
              {uploadAvatar.isPending ? t('play.uploading') : t('groups.groupPhoto')}
            </button>
            <p className="text-[11px] text-ink-muted mt-1.5">{t('groups.optionalMax4mb')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { void pickAvatar(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>
        </div>

        <Field label={t('groups.groupName')} hint={t('groups.groupNameHint', { length: name.length })}>
          <input
            type="text"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('groups.groupNamePlaceholder')}
            className="lm-input"
          />
        </Field>

        <Field label={t('groups.description')} hint={t('groups.descriptionHint')}>
          <input
            type="text"
            maxLength={140}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('groups.descriptionPlaceholder')}
            className="lm-input"
          />
        </Field>

        <Field label={t('groups.welcomeMessage')} hint={t('groups.welcomeMessageHint')}>
          <textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value.slice(0, 300))}
            rows={2}
            placeholder={t('groups.welcomeMessagePlaceholder')}
            className="lm-input resize-none no-scrollbar"
          />
        </Field>

        <Field label={t('groups.rulesInstructions')} hint={t('groups.rulesHint', { count: MIN_RULE_CHARS })}>
          <textarea
            ref={instructionsRef}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value.slice(0, 500))}
            onFocus={seedInstructions}
            onKeyDown={onInstructionsKeyDown}
            rows={3}
            placeholder={t('groups.rulesPlaceholder')}
            className="lm-input resize-none no-scrollbar"
          />
        </Field>

        <p className="text-[11px] text-ink-muted">
          {t('groups.ownerNote')}
        </p>
      </main>
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-ink-2 mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-ink-muted mt-1">{hint}</div>}
    </label>
  )
}
