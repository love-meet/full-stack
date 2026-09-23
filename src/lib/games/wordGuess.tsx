/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import { useState } from 'react'
import type { BoardProps, GameDef, Role } from './types'
import { other } from './types'
import { setGameSecret, guessWordLetter } from './secretApi'

/**
 * One player sets a word, the other guesses letters.
 *
 * The word is NOT in this state — it lives in chat_game_secrets, where RLS
 * only ever shows it to the setter. The public state carries the shape of the
 * word and what has been guessed, which is exactly what the guesser is
 * allowed to see. `solution` is filled in only once the game ends, and only
 * when `guess_word_letter` actually returns it (see below).
 */
export type WordGuessState = {
  phase: 'setting' | 'guessing'
  setter: Role
  /** Character mask: letters become '_', spaces stay spaces. No content. */
  mask: string
  /** Letters tried so far, in order. */
  guessed: string[]
  /** Positions (1-based) revealed so far, per letter. */
  hits: Record<string, number[]>
  wrong: number
  /** The word, revealed only when the game is over. */
  solution: string | null
}

export const MAX_WRONG = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** What the guesser can see: hit letters in place, everything else blank. */
function displayFor(state: WordGuessState): string[] {
  const out = state.mask.split('')
  for (const [letter, positions] of Object.entries(state.hits)) {
    for (const p of positions) out[p - 1] = letter
  }
  return out
}

function Board({ gameId, state, myRole, isMyTurn, finished, outcome, busy, onMove, onError }: BoardProps<WordGuessState>) {
  const [draft, setDraft] = useState('')
  // D13: freeze the word the moment `set_game_secret` succeeds. It cannot be
  // un-sent (set-once, silent no-op on re-send), so a retry after a failed
  // `play_chat_move` must resend this exact value, not whatever `draft` has
  // drifted to since.
  const [lockedWord, setLockedWord] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const amSetter = state.setter === myRole
  const guesser = other(state.setter)

  const candidate = lockedWord ?? draft.toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim()
  const candidateValid = candidate.replace(/ /g, '').length >= 3

  async function setWord() {
    if (busy || pending || finished || !isMyTurn) return
    if (lockedWord === null && !candidateValid) return
    setPending(true)
    try {
      if (lockedWord === null) {
        try {
          await setGameSecret(gameId, { word: candidate })
        } catch (e) {
          onError(e)
          return
        }
        setLockedWord(candidate)
      }
      const ok = await onMove(
        {
          state: { ...state, phase: 'guessing', mask: candidate.replace(/[A-Z]/g, '_') },
          nextTurn: guesser,
          summary: 'set a word — your turn to guess',
        },
        { secretSaved: true },
      )
      if (ok) setDraft('')
    } finally {
      setPending(false)
    }
  }

  async function guess(letter: string) {
    if (!isMyTurn || busy || pending || finished || state.guessed.includes(letter)) return
    setPending(true)
    try {
      let r: Awaited<ReturnType<typeof guessWordLetter>>
      try {
        r = await guessWordLetter(gameId, letter)
      } catch (e) {
        onError(e)
        return
      }
      const guessed = [...state.guessed, letter]
      const hits = r.hit ? { ...state.hits, [letter]: r.positions } : state.hits
      const wrong = r.hit ? state.wrong : state.wrong + 1
      const lost = wrong >= MAX_WRONG
      await onMove({
        state: {
          ...state,
          guessed,
          hits,
          wrong,
          solution: r.solved || lost ? r.word : null,
        },
        // The guesser keeps going until they solve it or run out.
        nextTurn: guesser,
        finished: r.solved || lost,
        winner: r.solved ? guesser : lost ? state.setter : null,
        summary: r.solved ? 'guessed the word' : lost ? 'ran out of guesses' : `guessed ${letter}`,
      })
    } finally {
      setPending(false)
    }
  }

  // ── Setting phase ──
  if (state.phase === 'setting') {
    if (!amSetter) {
      return <p className="text-center text-sm text-ink-muted py-6">Waiting for them to pick a word…</p>
    }
    return (
      <div className="space-y-3">
        <input
          value={lockedWord ?? draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A word or short phrase"
          maxLength={24}
          disabled={pending || finished || lockedWord !== null || !isMyTurn}
          className="lm-input w-full text-center tracking-[0.2em] uppercase disabled:opacity-70"
          aria-label="Word to guess"
        />
        <button
          onClick={setWord}
          disabled={pending || busy || finished || !isMyTurn || (lockedWord === null && !candidateValid)}
          className="w-full rounded-full py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose disabled:opacity-50"
        >
          {pending ? 'Setting…' : 'Set the word'}
        </button>
        {lockedWord && <p className="text-xs text-ink-muted text-center">Saved — tap again to send.</p>}
        <p className="text-xs text-ink-muted text-center">
          Letters and spaces. They get {MAX_WRONG} wrong guesses. They never see the word — not even in the page source.
        </p>
      </div>
    )
  }

  // ── Guessing phase ──
  const shown = state.solution ? state.solution.split('') : displayFor(state)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-1.5">
        {shown.map((ch, i) =>
          ch === ' ' ? (
            <span key={i} className="w-3" />
          ) : (
            <span
              key={i}
              className={[
                'w-7 h-9 rounded-md grid place-items-center text-lg font-bold border-b-2',
                ch === '_' ? 'text-transparent border-white/20' : 'text-ink border-rose',
              ].join(' ')}
            >
              {ch === '_' ? '·' : ch}
            </span>
          ),
        )}
      </div>

      <div className="text-center text-xs text-ink-muted">
        {MAX_WRONG - state.wrong} wrong {MAX_WRONG - state.wrong === 1 ? 'guess' : 'guesses'} left
      </div>

      {!finished && amSetter && (
        <p className="text-center text-sm text-ink-muted">They're guessing. Nothing for you to do.</p>
      )}

      {!finished && !amSetter && (
        <div className="grid grid-cols-7 gap-1 max-w-[19rem] mx-auto">
          {ALPHABET.map((letter) => {
            const used = state.guessed.includes(letter)
            const hit = used && !!state.hits[letter]
            return (
              <button
                key={letter}
                onClick={() => guess(letter)}
                disabled={!isMyTurn || busy || pending || used}
                className={[
                  'aspect-square rounded-md text-xs font-bold transition-colors',
                  used
                    ? hit ? 'bg-success/25 text-success' : 'bg-white/5 text-ink-muted/40'
                    : 'glass text-ink hover:bg-white/10',
                ].join(' ')}
              >
                {letter}
              </button>
            )
          })}
        </div>
      )}

      {outcome && (
        state.solution ? (
          <p className="text-center text-sm font-bold text-ink">The word was “{state.solution}”.</p>
        ) : (
          // 0095's guess_word_letter only returns the word once solved — on a
          // loss the guesser is never handed it by the server, so there is
          // nothing to reveal here. Say so instead of showing nothing.
          <p className="text-center text-sm text-ink-muted">
            {amSetter
              ? 'They ran out of guesses. You win — the word stays between you.'
              : "Out of guesses. It isn't revealed here — ask them in chat."}
          </p>
        )
      )}
    </div>
  )
}

export const wordGuess: GameDef<WordGuessState> = {
  kind: 'word_guess',
  name: 'Word Guess',
  emoji: '🔤',
  blurb: `You set a word. They guess it, ${MAX_WRONG} wrong letters allowed.`,
  // The inviter sets the word.
  initialState: () => ({
    phase: 'setting', setter: 'a', mask: '', guessed: [], hits: {}, wrong: 0, solution: null,
  }),
  status: (state, myRole, isMyTurn, outcome) => {
    if (outcome === 'won') return 'You win.'
    if (outcome === 'lost') return 'They win this one.'
    if (state.phase === 'setting') {
      return state.setter === myRole ? 'Pick a word for them' : 'Waiting for their word'
    }
    if (state.setter === myRole) return 'They’re guessing'
    return isMyTurn ? 'Your turn — pick a letter' : 'Waiting'
  },
  Board,
}
