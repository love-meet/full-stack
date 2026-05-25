// A soft two-tone "message arrived" chime, synthesized with the Web Audio API
// so we don't have to ship an audio file. Safe to call anywhere; it no-ops if
// the browser has no AudioContext or the user hasn't interacted yet (some
// browsers block audio until the first gesture).

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

/** Play a brief, pleasant incoming-message ping. */
export function playPing() {
  const ac = getCtx()
  if (!ac) return
  // Resume if the context was suspended (autoplay policy).
  if (ac.state === 'suspended') void ac.resume()

  const now = ac.currentTime
  const notes = [
    { freq: 880, start: 0,    dur: 0.12 }, // A5
    { freq: 1318, start: 0.1, dur: 0.16 }, // E6
  ]
  for (const n of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = n.freq
    gain.gain.setValueAtTime(0.0001, now + n.start)
    gain.gain.exponentialRampToValueAtTime(0.18, now + n.start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + n.start)
    osc.stop(now + n.start + n.dur + 0.02)
  }
}
