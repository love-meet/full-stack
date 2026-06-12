import { useState, useRef, useEffect } from 'react'
import { useMentionSearch } from '../hooks/useMentionSearch'
import MentionPopup from './MentionPopup'

type Props = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  rows?: number
  maxLength?: number
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * A textarea replacement that parses "@" to show an autocomplete MentionPopup.
 */
export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  rows = 1,
  maxLength = 500,
  autoFocus,
  onKeyDown,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const { results, loading } = useMentionSearch(mentionQuery ?? '')

  // Close popup if cursor moves away
  function updateMentionState() {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart
    
    // Look backwards from cursor for an '@'
    const textBeforeCursor = value.slice(0, cursor)
    const match = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(textBeforeCursor)

    if (match) {
      // match[1] is the query without '@'
      setMentionQuery(match[1])
      setMentionStart(cursor - match[1].length - 1)
      
      // Get rough rect
      const rect = el.getBoundingClientRect()
      setAnchorRect(rect)
    } else {
      setMentionQuery(null)
      setMentionStart(null)
      setAnchorRect(null)
    }
  }

  function handleSelectMention(handle: string) {
    if (mentionStart === null || !textareaRef.current) return
    
    const before = value.slice(0, mentionStart)
    const after = value.slice(textareaRef.current.selectionStart)
    const next = `${before}@${handle} ${after}`
    
    onChange(next)
    
    setMentionQuery(null)
    setMentionStart(null)
    setAnchorRect(null)
    
    // Restore focus and cursor
    setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        const newCursor = mentionStart + handle.length + 2 // +2 for @ and space
        el.setSelectionRange(newCursor, newCursor)
      }
    }, 0)
  }

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          updateMentionState()
        }}
        onClick={updateMentionState}
        onKeyUp={updateMentionState}
        placeholder={placeholder}
        className={className}
        rows={rows}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          // If popup is open, we let MentionPopup handle Arrow keys & Enter.
          // We must block them from the textarea so it doesn't move cursor or submit.
          if (mentionQuery !== null && results.length > 0) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
              // Wait, the MentionPopup adds a window keydown listener.
              // To prevent textarea default, we must prevent default here if those keys are pressed.
              e.preventDefault()
              // Actually, since the popup uses window listener, the event bubbles.
              // Let's just prevent default.
              return
            }
          }
          onKeyDown?.(e)
        }}
        style={{ overflow: 'hidden' }} // let it grow, hide scrollbar
      />

      {mentionQuery !== null && (
        <MentionPopup
          query={mentionQuery}
          results={results}
          loading={loading}
          anchorRect={anchorRect}
          onSelect={handleSelectMention}
          onDismiss={() => {
            setMentionQuery(null)
            setMentionStart(null)
            setAnchorRect(null)
            textareaRef.current?.focus()
          }}
        />
      )}
    </>
  )
}
