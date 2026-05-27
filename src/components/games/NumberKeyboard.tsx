/** A number-only keypad (digits, decimal point, backspace) plus an action
 *  button. Used for picking a secret number and for guessing. */
export default function NumberKeyboard({
  value, onChange, onSubmit, actionLabel, disabled, maxLen = 9,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  actionLabel: string
  disabled?: boolean
  maxLen?: number
}) {
  function press(k: string) {
    if (disabled) return
    if (k === '.') {
      if (value.includes('.') || value.length >= maxLen) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    if (value.length >= maxLen) return
    // avoid a pointless leading zero like "05"
    if (value === '0') { onChange(k); return }
    onChange(value + k)
  }
  function back() { if (!disabled) onChange(value.slice(0, -1)) }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
  const valid = value !== '' && value !== '.' && !Number.isNaN(Number(value))

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === '⌫' ? back() : press(k))}
            disabled={disabled}
            className="h-12 rounded-xl glass text-xl font-bold text-ink active:scale-95 transition disabled:opacity-40"
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !valid}
        className="mt-2 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-40"
      >
        {actionLabel}
      </button>
    </div>
  )
}
