/** A number-only keypad (digits, decimal point, backspace) plus an action
 *  button. Used for picking a secret number and for guessing. */
export default function NumberKeyboard({
  value, onChange, onSubmit, actionLabel, disabled, maxLen = 9, maxDecimals = 2,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  actionLabel: string
  disabled?: boolean
  maxLen?: number
  /** How many digits are allowed after the decimal point. 0 disables the
   *  decimal key entirely (integers only). */
  maxDecimals?: number
}) {
  function press(k: string) {
    if (disabled) return
    if (k === '.') {
      if (maxDecimals === 0) return
      if (value.includes('.') || value.length >= maxLen) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    if (value.length >= maxLen) return
    // Respect the per-round decimal cap.
    if (value.includes('.') && (value.split('.')[1] ?? '').length >= maxDecimals) return
    // avoid a pointless leading zero like "05"
    if (value === '0') { onChange(k); return }
    onChange(value + k)
  }
  function back() { if (!disabled) onChange(value.slice(0, -1)) }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
  const valid = value !== '' && value !== '.' && !Number.isNaN(Number(value))

  // Brushed-steel key: top highlight + inner shadow + drop shadow, presses in.
  const steelKey: React.CSSProperties = {
    background: 'linear-gradient(180deg, #8b929c 0%, #5b6470 46%, #2c323c 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 5px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.5)',
    border: '1px solid rgba(0,0,0,0.55)',
    textShadow: '0 1px 1px rgba(0,0,0,0.7)',
  }

  return (
    <div className="w-full max-w-xs mx-auto">
      {/* Stone slab the keys sit in. */}
      <div
        className="rounded-2xl p-2.5"
        style={{
          background: 'linear-gradient(180deg, #3a3f47 0%, #20242b 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(0,0,0,0.6), 0 6px 16px rgba(0,0,0,0.45)',
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => {
            const keyDisabled = disabled || (k === '.' && maxDecimals === 0)
            return (
              <button
                key={k}
                type="button"
                onClick={() => (k === '⌫' ? back() : press(k))}
                disabled={keyDisabled}
                style={steelKey}
                className="h-12 rounded-xl text-xl font-extrabold text-zinc-100 select-none transition active:translate-y-px active:brightness-90 disabled:opacity-40"
              >
                {k}
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !valid}
        className="mt-2.5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-40"
      >
        {actionLabel}
      </button>
    </div>
  )
}
