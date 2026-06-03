/**
 * PixelRushLobby — the "waiting for opponent" surface for Pixel Rush, rendered
 * through PixiJS canvas. Replaces the DOM lobby card.
 *
 * Scene composition:
 *   bgLayer  — blurred /pixel-rush.png, dark navy wash, cyan corner glows
 *              (same palette as PixelRushCanvas so the transition feels
 *              seamless when the match actually starts)
 *   hudLayer — host avatar (top-left), opponent avatar slot (top-right),
 *              status text in the centre, INVITE A FRIEND button, invite
 *              code, close button at the bottom
 *   fxLayer  — sparkles + 3-2-1 GO countdown when both players are in
 *
 * State machine:
 *   waiting   only the host is in. Shows the empty opponent slot, the
 *             "WAITING FOR OPPONENT…" pulse, and the big invite button.
 *   ready     opponent has joined. Avatar slides in from the right,
 *             3-2-1 countdown plays, then onAutoStart fires.
 *   starting  countdown finished; sparkles burst, parent navigates into
 *             the actual game canvas.
 */

import { useEffect, useRef } from 'react'
import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  Ticker,
} from 'pixi.js'

const ACCENT = 0x35CDE8
const ACCENT_2 = 0x6CE8FA
const BG_DARK = 0x0A1A2C
const DANGER = 0xFF5C7A
const SUCCESS = 0x3DDC97
const WHITE = 0xFFFFFF

type PlayerInfo = { name: string; avatarUrl: string }

type Props = {
  inviteCode: string
  inviteUrl: string
  host: PlayerInfo
  joiner: PlayerInfo | null
  isHost: boolean
  onShareClick: () => void
  onCloseClick: () => void
  /** Called once after the 3-2-1 countdown finishes (host-only effect). */
  onAutoStart?: () => void
  /** Optional banner: opponent walked away mid-game and we're back to lobby. */
  revertedFromMatch?: boolean
  /**
   * 'host'   — default. Big cyan button reads "INVITE A FRIEND".
   * 'joiner' — invitee view. Button reads "JOIN GAME" and calls
   *            `onPrimaryClick`. Host slot stays filled (the inviter),
   *            opponent slot stays as the placeholder until the joiner
   *            actually taps JOIN — same visual rhythm so the surface
   *            feels uniform end-to-end.
   */
  mode?: 'host' | 'joiner'
  /** Overrides the primary canvas button label. Defaults per `mode`. */
  primaryLabel?: string
  /** Disables the primary canvas button (e.g. anon needs to type a name first). */
  primaryDisabled?: boolean
  /** Overrides the primary button action. Defaults to `onShareClick`. */
  onPrimaryClick?: () => void
  /** Overrides the subtitle text under the wordmark. */
  subtitleText?: string
  /** Overrides the close-button text. */
  closeLabel?: string
  /** Optional DOM name input rendered over the canvas (anon joiner flow). */
  nameInput?: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    error?: string
  }
}

export default function PixelRushLobby({
  inviteCode,
  inviteUrl: _inviteUrl,
  host,
  joiner,
  isHost,
  onShareClick,
  onCloseClick,
  onAutoStart,
  revertedFromMatch,
  mode = 'host',
  primaryLabel,
  primaryDisabled = false,
  onPrimaryClick,
  subtitleText,
  closeLabel,
  nameInput,
}: Props) {
  const resolvedPrimaryLabel =
    primaryLabel ?? (mode === 'joiner' ? '►  JOIN GAME  ►' : '✦  INVITE A FRIEND  ✦')
  const resolvedSubtitle =
    subtitleText ?? (mode === 'joiner' ? 'INVITED · 1 v 1 MATCH' : 'LOBBY · 1 v 1 MATCH')
  const resolvedCloseLabel = closeLabel ?? (mode === 'joiner' ? 'DECLINE' : 'CLOSE LOBBY')
  const wrapRef = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks in a ref so we don't have to rebuild the scene
  // when the parent re-renders. primaryDisabled toggles in real time as the
  // anon name input validates; the ticker reads it to dim the button.
  const callbacksRef = useRef({
    onShareClick,
    onCloseClick,
    onAutoStart,
    onPrimaryClick,
    primaryDisabled,
  })
  callbacksRef.current = {
    onShareClick,
    onCloseClick,
    onAutoStart,
    onPrimaryClick,
    primaryDisabled,
  }

  // The scene cares about three pieces of dynamic state:
  //  - whether the joiner has arrived
  //  - the joiner's avatar URL (load lazily)
  //  - revertedFromMatch banner
  // We mirror them into a ref so the ticker can read the current values
  // without re-running the entire effect.
  const stateRef = useRef({ joiner, revertedFromMatch })
  stateRef.current = { joiner, revertedFromMatch }

  useEffect(() => {
    let mounted = true
    let app: Application | null = null
    let cleanupFns: Array<() => void> = []

    async function setup() {
      if (!wrapRef.current) return
      app = new Application()
      await app.init({
        backgroundAlpha: 0,
        resizeTo: wrapRef.current,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      if (!mounted || !app) { app?.destroy(true); return }
      wrapRef.current.appendChild(app.canvas)
      app.canvas.style.touchAction = 'manipulation'

      const W = () => app!.screen.width
      const H = () => app!.screen.height

      // ── Background ──────────────────────────────────────────────────────
      const bgLayer = new Container()
      const hudLayer = new Container()
      const fxLayer = new Container()
      app.stage.addChild(bgLayer)
      app.stage.addChild(hudLayer)
      app.stage.addChild(fxLayer)

      // Dark navy plate
      const plate = new Graphics().rect(0, 0, W(), H()).fill({ color: BG_DARK, alpha: 0.96 })
      bgLayer.addChild(plate)

      // Themed artwork backdrop (Pixel Rush) — blurred, tinted cyan
      const themeTex = await Assets.load('/pixel-rush.png').catch(() => null)
      if (!mounted || !app) { app?.destroy(true); return }
      if (themeTex) {
        const themeSprite = new Sprite(themeTex)
        themeSprite.alpha = 0.22
        themeSprite.tint = ACCENT_2
        themeSprite.filters = [new BlurFilter({ strength: 18 })]
        themeSprite.width = W() * 1.2
        themeSprite.height = (themeTex.height / themeTex.width) * themeSprite.width
        themeSprite.x = (W() - themeSprite.width) / 2
        themeSprite.y = (H() - themeSprite.height) / 2
        bgLayer.addChild(themeSprite)
      }

      // Cyan corner glows
      const glow1 = new Graphics()
        .circle(0, 0, Math.max(W(), H()) * 0.55)
        .fill({ color: ACCENT, alpha: 0.11 })
      glow1.x = W() * 0.08
      glow1.y = H() * 0.10
      glow1.filters = [new BlurFilter({ strength: 32 })]
      bgLayer.addChild(glow1)

      const glow2 = new Graphics()
        .circle(0, 0, Math.max(W(), H()) * 0.55)
        .fill({ color: ACCENT_2, alpha: 0.08 })
      glow2.x = W() * 0.92
      glow2.y = H() * 0.92
      glow2.filters = [new BlurFilter({ strength: 32 })]
      bgLayer.addChild(glow2)

      // ── Helpers ─────────────────────────────────────────────────────────
      const fontFamily = 'Inter, system-ui, sans-serif'

      function makeText(text: string, opts: Partial<TextStyle> & { size?: number }) {
        const t = new Text({
          text,
          style: new TextStyle({
            fontFamily,
            fontWeight: '800',
            fill: opts.fill ?? WHITE,
            fontSize: opts.size ?? 16,
            letterSpacing: opts.letterSpacing ?? 0,
            dropShadow: opts.dropShadow ?? {
              color: 0x000000,
              blur: 4,
              angle: Math.PI / 2,
              distance: 2,
              alpha: 0.45,
            },
          }),
        })
        return t
      }

      // ── Avatar slot ─────────────────────────────────────────────────────
      // Returns a Container holding the avatar circle + ring + label. The
      // returned `setAvatar` lets us swap in the texture once it's loaded,
      // and `setEmpty` shows the "?" placeholder.
      function makeAvatarSlot(label: string, accent: number) {
        const radius = 36
        const container = new Container()

        // Outer ring (cyan border)
        const ring = new Graphics()
          .circle(0, 0, radius + 3)
          .stroke({ color: accent, width: 3, alpha: 0.92 })
        container.addChild(ring)

        // Inner circle — dark plate to host either the avatar texture or the
        // placeholder graphics.
        const plate = new Graphics().circle(0, 0, radius).fill({ color: BG_DARK, alpha: 0.95 })
        container.addChild(plate)

        // Dashed-style placeholder ring + "?" — visible when no avatar.
        const placeholder = new Graphics()
          .circle(0, 0, radius - 3)
          .stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.25 })
        container.addChild(placeholder)
        const q = makeText('?', { size: 28, fill: 0xFFFFFF })
        q.alpha = 0.45
        q.anchor.set(0.5)
        container.addChild(q)

        // Avatar sprite container — added lazily.
        const avatarHolder = new Container()
        container.addChild(avatarHolder)

        // Name label below
        const nameText = makeText(label, { size: 11, letterSpacing: 1.6 })
        nameText.alpha = 0.85
        nameText.anchor.set(0.5)
        nameText.y = radius + 16
        container.addChild(nameText)

        function setEmpty() {
          avatarHolder.removeChildren()
          placeholder.visible = true
          q.visible = true
        }
        async function setAvatar(url: string) {
          try {
            const tex = await Assets.load(url)
            if (!mounted) return
            const sp = new Sprite(tex)
            sp.anchor.set(0.5)
            // Cover-fit the avatar into the circle.
            const min = Math.min(tex.width, tex.height) || 1
            const scale = (radius * 2) / min
            sp.scale.set(scale)
            const mask = new Graphics().circle(0, 0, radius).fill(0xFFFFFF)
            avatarHolder.addChild(mask)
            avatarHolder.addChild(sp)
            sp.mask = mask
            placeholder.visible = false
            q.visible = false
          } catch {
            /* keep placeholder */
          }
        }
        function setLabel(s: string) { nameText.text = s }
        return { container, setAvatar, setEmpty, setLabel }
      }

      // Host slot (top-left)
      const hostSlot = makeAvatarSlot('HOST', ACCENT_2)
      hudLayer.addChild(hostSlot.container)
      void hostSlot.setAvatar(host.avatarUrl)
      hostSlot.setLabel(host.name.toUpperCase().slice(0, 16))

      // Joiner slot (top-right) — empty until joiner arrives
      const joinerSlot = makeAvatarSlot('OPPONENT', WHITE)
      joinerSlot.container.alpha = 0.55
      hudLayer.addChild(joinerSlot.container)

      // ── Center status + invite button ───────────────────────────────────
      const centerStack = new Container()
      hudLayer.addChild(centerStack)

      // "PIXEL RUSH" mark above the status
      const titleText = makeText('PIXEL RUSH', {
        size: 32,
        fill: ACCENT_2,
        letterSpacing: 4,
      })
      titleText.anchor.set(0.5, 1)
      centerStack.addChild(titleText)

      const subtitleNode = makeText(resolvedSubtitle, { size: 11, letterSpacing: 3.2 })
      subtitleNode.alpha = 0.65
      subtitleNode.anchor.set(0.5, 0)
      centerStack.addChild(subtitleNode)

      // Waiting text (shown when joiner is null)
      const waitingText = makeText('WAITING FOR OPPONENT', { size: 13, letterSpacing: 3.2 })
      waitingText.alpha = 0.85
      waitingText.anchor.set(0.5)
      hudLayer.addChild(waitingText)

      const waitingDots = makeText('•••', { size: 18, letterSpacing: 6, fill: ACCENT_2 })
      waitingDots.anchor.set(0.5)
      hudLayer.addChild(waitingDots)

      // Primary canvas button — INVITE A FRIEND for host, JOIN GAME for
      // joiner. Disabled visual when primaryDisabled (e.g. anon name not
      // typed yet on the join screen).
      const inviteBtn = new Container()
      inviteBtn.eventMode = 'static'
      inviteBtn.cursor = 'pointer'
      const inviteBg = new Graphics()
      inviteBtn.addChild(inviteBg)
      const inviteText = makeText(resolvedPrimaryLabel, {
        size: 15,
        letterSpacing: 2.6,
        fill: WHITE,
      })
      inviteText.anchor.set(0.5)
      inviteBtn.addChild(inviteText)
      hudLayer.addChild(inviteBtn)

      inviteBtn.on('pointerdown', () => {
        if (callbacksRef.current.primaryDisabled) return
        inviteBtn.scale.set(0.97)
      })
      inviteBtn.on('pointerup', () => {
        inviteBtn.scale.set(1)
        if (callbacksRef.current.primaryDisabled) return
        const handler = callbacksRef.current.onPrimaryClick ?? callbacksRef.current.onShareClick
        handler()
      })
      inviteBtn.on('pointerupoutside', () => { inviteBtn.scale.set(1) })

      // Invite code (small, below the button) — host only. Joiners don't
      // need to see the code; they came in via the link itself.
      const codeText = makeText(`CODE: ${inviteCode.toUpperCase()}`, {
        size: 11,
        letterSpacing: 4,
        fill: ACCENT_2,
      })
      codeText.alpha = 0.85
      codeText.anchor.set(0.5)
      codeText.visible = mode !== 'joiner'
      hudLayer.addChild(codeText)

      // Close button (bottom)
      const closeBtn = new Container()
      closeBtn.eventMode = 'static'
      closeBtn.cursor = 'pointer'
      const closeBg = new Graphics()
      closeBtn.addChild(closeBg)
      const closeText = makeText(resolvedCloseLabel, { size: 11, letterSpacing: 2.4 })
      closeText.alpha = 0.7
      closeText.anchor.set(0.5)
      closeBtn.addChild(closeText)
      hudLayer.addChild(closeBtn)

      closeBtn.on('pointerdown', () => { closeBtn.scale.set(0.96) })
      closeBtn.on('pointerup', () => {
        closeBtn.scale.set(1)
        callbacksRef.current.onCloseClick()
      })
      closeBtn.on('pointerupoutside', () => { closeBtn.scale.set(1) })

      // Reverted-from-match banner (optional)
      let revertedBanner: { container: Container } | null = null
      if (revertedFromMatch) {
        const c = new Container()
        const bg = new Graphics()
          .roundRect(-150, -22, 300, 44, 12)
          .fill({ color: DANGER, alpha: 0.12 })
          .stroke({ color: DANGER, width: 1, alpha: 0.55 })
        c.addChild(bg)
        const t = makeText('🚪  YOUR OPPONENT LEFT', { size: 11, letterSpacing: 2 })
        t.anchor.set(0.5)
        c.addChild(t)
        hudLayer.addChild(c)
        revertedBanner = { container: c }
      }

      // Countdown text (hidden by default, shown when both players ready)
      const countdownText = makeText('', {
        size: 120,
        fill: WHITE,
        dropShadow: {
          color: 0x000000,
          blur: 16,
          angle: Math.PI / 2,
          distance: 6,
          alpha: 0.5,
        },
      })
      countdownText.anchor.set(0.5)
      countdownText.visible = false
      fxLayer.addChild(countdownText)

      const readyText = makeText('BOTH PLAYERS READY', { size: 14, letterSpacing: 3.6, fill: SUCCESS })
      readyText.anchor.set(0.5)
      readyText.visible = false
      fxLayer.addChild(readyText)

      // ── Layout (re-runs on resize) ──────────────────────────────────────
      function layout() {
        const w = W(); const h = H()
        // Avatar slots — both sit near the top, framing the title
        const topY = Math.max(80, h * 0.16)
        hostSlot.container.x = w * 0.22
        hostSlot.container.y = topY
        joinerSlot.container.x = w * 0.78
        joinerSlot.container.y = topY

        // Center stack
        centerStack.x = w / 2
        centerStack.y = h * 0.42
        titleText.y = -8
        subtitleNode.y = 8

        // Waiting text + dots, just below the title
        waitingText.x = w / 2
        waitingText.y = h * 0.52
        waitingDots.x = w / 2
        waitingDots.y = h * 0.55

        // Invite button — large, central
        const btnW = Math.min(w - 56, 360)
        const btnH = 58
        inviteBg.clear()
          .roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 28)
          .fill({ color: ACCENT, alpha: 0.95 })
          .stroke({ color: ACCENT_2, width: 1.5, alpha: 0.85 })
        inviteBtn.x = w / 2
        inviteBtn.y = h * 0.62

        codeText.x = w / 2
        codeText.y = h * 0.62 + 50

        // Close button — small, near bottom
        const closeW = 160; const closeH = 36
        closeBg.clear()
          .roundRect(-closeW / 2, -closeH / 2, closeW, closeH, 18)
          .fill({ color: 0xFFFFFF, alpha: 0.06 })
          .stroke({ color: 0xFFFFFF, width: 1, alpha: 0.15 })
        closeBtn.x = w / 2
        closeBtn.y = h - 56

        if (revertedBanner) {
          revertedBanner.container.x = w / 2
          revertedBanner.container.y = topY - 60
        }

        countdownText.x = w / 2
        countdownText.y = h / 2
        readyText.x = w / 2
        readyText.y = h / 2 - 80
      }
      layout()
      const resizeObs = new ResizeObserver(() => {
        if (!app) return
        layout()
      })
      if (wrapRef.current) resizeObs.observe(wrapRef.current)
      cleanupFns.push(() => resizeObs.disconnect())

      // ── Countdown state ─────────────────────────────────────────────────
      type Phase = 'waiting' | 'ready' | 'starting'
      let phase: Phase = 'waiting'
      let countdownStartedAt = 0
      const COUNTDOWN_MS = 3000

      function showReady() {
        readyText.visible = true
        readyText.alpha = 0
        countdownText.visible = true
        countdownText.alpha = 0
        countdownStartedAt = Date.now()
      }

      function celebrate() {
        // Sparkle burst at centre
        type Sparkle = { g: Graphics; vx: number; vy: number; vr: number; life: number }
        const sparkles: Sparkle[] = []
        const sparkleContainer = new Container()
        fxLayer.addChild(sparkleContainer)
        for (let i = 0; i < 60; i++) {
          const g = new Graphics()
            .star(0, 0, 5, 7, 3)
            .fill({ color: i % 2 ? ACCENT : ACCENT_2 })
          g.x = W() / 2 + (Math.random() - 0.5) * 30
          g.y = H() / 2 + (Math.random() - 0.5) * 30
          sparkleContainer.addChild(g)
          sparkles.push({
            g,
            vx: (Math.random() - 0.5) * 12,
            vy: -Math.random() * 14 - 4,
            vr: (Math.random() - 0.5) * 0.5,
            life: 1,
          })
        }
        const burstTicker = (t: Ticker) => {
          const dt = t.deltaTime
          for (let i = sparkles.length - 1; i >= 0; i--) {
            const s = sparkles[i]
            s.g.x += s.vx * dt
            s.g.y += s.vy * dt
            s.vy += 0.4 * dt
            s.g.rotation += s.vr * dt
            s.life -= 0.012 * dt
            s.g.alpha = Math.max(0, s.life)
            if (s.life <= 0) {
              sparkleContainer.removeChild(s.g)
              s.g.destroy()
              sparkles.splice(i, 1)
            }
          }
          if (sparkles.length === 0) {
            app?.ticker.remove(burstTicker)
            sparkleContainer.destroy()
          }
        }
        app!.ticker.add(burstTicker)
      }

      // ── Ticker — animation + state transitions ──────────────────────────
      let lastJoinerSeen = false
      const ticker = (_t: Ticker) => {
        const now = Date.now()
        const j = stateRef.current.joiner

        // Detect joiner arrival → enter ready phase
        if (j && !lastJoinerSeen) {
          lastJoinerSeen = true
          phase = 'ready'

          // Swap opponent slot from empty → real avatar with a pop
          joinerSlot.container.alpha = 1
          joinerSlot.setLabel(j.name.toUpperCase().slice(0, 16))
          void joinerSlot.setAvatar(j.avatarUrl)
          joinerSlot.container.scale.set(0.6)

          // Hide invite button + waiting text
          inviteBtn.visible = false
          codeText.visible = false
          waitingText.visible = false
          waitingDots.visible = false

          showReady()
        }
        // Inverse — joiner left while we were in ready (shouldn't normally
        // happen but possible if server reverts the match)
        if (!j && lastJoinerSeen) {
          lastJoinerSeen = false
          phase = 'waiting'
          joinerSlot.container.alpha = 0.55
          joinerSlot.setEmpty()
          inviteBtn.visible = true
          codeText.visible = true
          waitingText.visible = true
          waitingDots.visible = true
          readyText.visible = false
          countdownText.visible = false
        }

        if (phase === 'waiting') {
          // Pulse on the waiting text
          waitingText.alpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(now / 380))
          // Animated dots — cycle which dot is bright
          const tick = Math.floor(now / 280) % 3
          waitingDots.text = ['•··', '·•·', '··•'][tick]
          // Gentle scale pulse on the invite button, dimmed when disabled
          const pulse = 1 + 0.012 * Math.sin(now / 360)
          inviteBtn.scale.set(pulse)
          inviteBtn.alpha = callbacksRef.current.primaryDisabled ? 0.45 : 1
          inviteBtn.cursor = callbacksRef.current.primaryDisabled ? 'not-allowed' : 'pointer'
        }

        if (phase === 'ready') {
          // Pop the joiner slot in
          if (joinerSlot.container.scale.x < 1) {
            const next = Math.min(1, joinerSlot.container.scale.x + 0.05)
            joinerSlot.container.scale.set(next)
          }

          readyText.alpha = Math.min(1, readyText.alpha + 0.05)

          // Countdown 3 → 2 → 1 → GO
          const elapsed = now - countdownStartedAt
          const remaining = COUNTDOWN_MS - elapsed
          let label = ''
          if (remaining > 2000) label = '3'
          else if (remaining > 1000) label = '2'
          else if (remaining > 0) label = '1'
          else if (remaining > -700) label = 'GO!'
          if (label !== countdownText.text) {
            countdownText.text = label
            // Pop in
            countdownText.scale.set(0.5)
            countdownText.alpha = 1
          }
          // Scale settle
          if (countdownText.scale.x < 1) {
            countdownText.scale.set(Math.min(1, countdownText.scale.x + 0.08))
          }

          if (remaining <= -700 && phase === 'ready') {
            // Done — fire auto-start, burst sparkles, freeze
            phase = 'starting'
            celebrate()
            if (isHost) callbacksRef.current.onAutoStart?.()
          }
        }
      }
      app.ticker.add(ticker)
      cleanupFns.push(() => app?.ticker.remove(ticker))
    }

    setup().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[PixelRushLobby] setup failed', err)
    })

    return () => {
      mounted = false
      cleanupFns.forEach((fn) => { try { fn() } catch { /* ignore */ } })
      cleanupFns = []
      if (app) {
        try { app.destroy(true, { children: true, texture: false }) } catch { /* ignore */ }
      }
    }
    // Rebuild only on identity-level prop changes; primaryDisabled,
    // primaryClick and the avatar URLs flow through refs so the ticker can
    // react without tearing the scene down. mode/labels are baked in at
    // setup, so changes there do trigger a clean rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    host.avatarUrl,
    inviteCode,
    isHost,
    mode,
    resolvedPrimaryLabel,
    resolvedSubtitle,
    resolvedCloseLabel,
  ])

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: '#050B14' }}
    >
      {/* DOM name input — anon joiner needs a typed name before tapping JOIN.
          Sits over the canvas, positioned so it lands above the primary
          button. Pointer-events isolated to its own block so the canvas's
          background touch handlers still work. */}
      {nameInput && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-40px))]"
          style={{ top: 'calc(50vh + 16px)' }}
        >
          <label className="block">
            <div
              className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2 text-center"
              style={{ color: ACCENT_2_CSS, opacity: 0.85 }}
            >
              Pick a name to join
            </div>
            <input
              type="text"
              value={nameInput.value}
              onChange={(e) => nameInput.onChange(e.target.value)}
              placeholder={nameInput.placeholder ?? 'Your name'}
              maxLength={24}
              autoFocus
              className="w-full bg-transparent text-center text-white text-base font-bold tracking-wide outline-none placeholder:text-white/30"
              style={{
                border: `1px solid ${ACCENT_2_CSS}55`,
                borderRadius: 999,
                padding: '12px 18px',
                background: 'rgba(0,0,0,0.35)',
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04)`,
              }}
            />
            {nameInput.error && (
              <div className="mt-2 text-center text-[11px] text-rose font-semibold">
                {nameInput.error}
              </div>
            )}
          </label>
        </div>
      )}
    </div>
  )
}

const ACCENT_2_CSS = '#6CE8FA'

// Bind to silence unused warnings for Texture (kept available for callers).
export type { Texture as _TextureBinding }
