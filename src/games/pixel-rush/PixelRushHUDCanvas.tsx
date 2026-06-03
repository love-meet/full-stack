/**
 * PixelRushHUDCanvas — the in-game HUD for Pixel Rush, rendered through
 * PixiJS. Replaces the DOM `fixed top` header that used to live in
 * PlayGameScreen's `Match` component for pixel_rush games.
 *
 * Sits as a fixed-top canvas, ~118px tall (plus the Telegram inset). The
 * gameplay canvas (PixelRushCanvas) sits below it in normal DOM flow.
 * Layout:
 *
 *   [ ROUND N/M ]               [ ⏻ LEAVE ]
 *   ─────────────────────────────────────────
 *   ◯ Host             VS               ◯ Me
 *   Name · 100%                  Name · 100%
 *   Score                              Score
 *
 * Reactive to props (scores, percentages, round number) via a stateRef
 * pattern so the parent can re-render at any frequency without tearing
 * down the canvas scene.
 */

import { useEffect, useRef } from 'react'
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Ticker,
} from 'pixi.js'

const ACCENT = 0x35CDE8
const ACCENT_2 = 0x6CE8FA
const BG_DARK = 0x0A1A2C
const SUCCESS = 0x3DDC97
const MUTED = 0x7C8893
const DANGER = 0xFF5C7A

type PlayerChip = {
  userId: string
  name: string
  avatarUrl: string
  score: number
  trophies: number
  pct: number | null
  online: boolean
  isMe: boolean
  isHost: boolean
}

type Props = {
  /** Left chip (opponent if viewer is a player, host otherwise). */
  left: PlayerChip | null
  /** Right chip (the local player when they're playing). */
  right: PlayerChip | null
  currentRound: number
  totalRounds: number
  trophiesLeft?: number
  trophiesRight?: number
  isHost: boolean
  isPlayer: boolean
  onLeaveClick: () => void
}

export default function PixelRushHUDCanvas(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(props)
  stateRef.current = props

  // Hold latest avatar URLs so we only re-load textures on actual changes.
  const lastLoadedAvatars = useRef({ left: '', right: '' })

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

      const fontFamily = 'Inter, system-ui, sans-serif'
      const mkText = (text: string, opts: Partial<TextStyle> & { size?: number; weight?: TextStyle['fontWeight'] }) => {
        return new Text({
          text,
          style: new TextStyle({
            fontFamily,
            fontWeight: opts.weight ?? '800',
            fill: opts.fill ?? 0xffffff,
            fontSize: opts.size ?? 13,
            letterSpacing: opts.letterSpacing ?? 0,
            dropShadow: opts.dropShadow ?? {
              color: 0x000000,
              blur: 3,
              angle: Math.PI / 2,
              distance: 1.5,
              alpha: 0.45,
            },
          }),
        })
      }

      // ── Background ──────────────────────────────────────────────────────
      // Glass plate with cyan tinted bottom accent line. Subtle blur on a
      // dark navy plate so the gameplay canvas below shows through but the
      // HUD content reads cleanly.
      const bgPlate = new Graphics()
      app.stage.addChild(bgPlate)
      const accentLine = new Graphics()
      app.stage.addChild(accentLine)

      // ── Top row: ROUND counter + LEAVE button ───────────────────────────
      const topRow = new Container()
      app.stage.addChild(topRow)

      const roundLabel = mkText('ROUND 1/9', { size: 11, letterSpacing: 2 })
      roundLabel.alpha = 0.95
      topRow.addChild(roundLabel)

      const trophyText = mkText('', { size: 11, letterSpacing: 1.5, fill: 0xFFC861 })
      trophyText.alpha = 0.95
      trophyText.visible = false
      topRow.addChild(trophyText)

      // Leave button — interactive
      const leaveBtn = new Container()
      leaveBtn.eventMode = 'static'
      leaveBtn.cursor = 'pointer'
      const leaveBg = new Graphics()
      leaveBtn.addChild(leaveBg)
      const leaveText = mkText('⏻  LEAVE', { size: 11, letterSpacing: 1.6, fill: 0xFFFFFF })
      leaveText.anchor.set(0.5)
      leaveBtn.addChild(leaveText)
      topRow.addChild(leaveBtn)
      leaveBtn.on('pointerdown', () => { leaveBtn.scale.set(0.96) })
      leaveBtn.on('pointerup', () => {
        leaveBtn.scale.set(1)
        stateRef.current.onLeaveClick()
      })
      leaveBtn.on('pointerupoutside', () => { leaveBtn.scale.set(1) })

      // ── Bottom row: avatars + scores + VS ───────────────────────────────
      const bottomRow = new Container()
      app.stage.addChild(bottomRow)

      type ChipNodes = {
        container: Container
        ring: Graphics
        plate: Graphics
        avatarHolder: Container
        onlineDot: Graphics
        nameText: Text
        pctText: Text
        scoreText: Text
        currentAvatarUrl: string
      }

      function makeChipNodes(side: 'left' | 'right'): ChipNodes {
        const container = new Container()
        const radius = 22
        const ring = new Graphics()
          .circle(0, 0, radius + 2)
          .stroke({ color: ACCENT_2, width: 2, alpha: 0.85 })
        container.addChild(ring)
        const plate = new Graphics()
          .circle(0, 0, radius)
          .fill({ color: BG_DARK, alpha: 0.92 })
        container.addChild(plate)
        const avatarHolder = new Container()
        container.addChild(avatarHolder)
        const onlineDot = new Graphics()
          .circle(0, 0, 5)
          .fill({ color: SUCCESS })
          .stroke({ color: 0x050B14, width: 2 })
        // Position dot bottom-right of the avatar circle
        onlineDot.x = side === 'left' ? radius - 4 : -(radius - 4)
        onlineDot.y = radius - 4
        container.addChild(onlineDot)

        const nameText = mkText('', { size: 12, weight: '700' })
        nameText.anchor.set(side === 'left' ? 0 : 1, 0)
        nameText.y = -radius - 2
        nameText.x = side === 'left' ? radius + 10 : -(radius + 10)
        container.addChild(nameText)

        const pctText = mkText('', { size: 10, letterSpacing: 1, fill: ACCENT_2 })
        pctText.anchor.set(side === 'left' ? 0 : 1, 0)
        pctText.y = -radius + 12
        pctText.x = side === 'left' ? radius + 10 : -(radius + 10)
        container.addChild(pctText)

        const scoreText = mkText('0', { size: 22, weight: '900', fill: ACCENT_2 })
        scoreText.anchor.set(side === 'left' ? 0 : 1, 0)
        scoreText.y = 4
        scoreText.x = side === 'left' ? radius + 10 : -(radius + 10)
        container.addChild(scoreText)

        return { container, ring, plate, avatarHolder, onlineDot, nameText, pctText, scoreText, currentAvatarUrl: '' }
      }

      const leftChip = makeChipNodes('left')
      const rightChip = makeChipNodes('right')
      bottomRow.addChild(leftChip.container)
      bottomRow.addChild(rightChip.container)

      // VS text in the middle of the bottom row
      const vsText = mkText('VS', { size: 18, weight: '900', fill: ACCENT })
      vsText.anchor.set(0.5)
      bottomRow.addChild(vsText)

      // ── Layout (re-runs on resize) ──────────────────────────────────────
      function layout() {
        const w = W(); const h = H()

        // Background plate
        bgPlate.clear()
          .rect(0, 0, w, h)
          .fill({ color: BG_DARK, alpha: 0.92 })
        // Cyan accent line at the bottom of the HUD
        accentLine.clear()
          .rect(0, h - 1.5, w, 1.5)
          .fill({ color: ACCENT, alpha: 0.55 })

        // Top row positions
        const topY = 14
        roundLabel.x = 18
        roundLabel.y = topY
        trophyText.x = 18
        trophyText.y = topY + 14

        // Leave button (right-aligned)
        const leaveW = 84; const leaveH = 28
        leaveBg.clear()
          .roundRect(-leaveW / 2, -leaveH / 2, leaveW, leaveH, 14)
          .fill({ color: DANGER, alpha: 0.18 })
          .stroke({ color: DANGER, width: 1, alpha: 0.55 })
        leaveBtn.x = w - leaveW / 2 - 14
        leaveBtn.y = topY + 6

        // Bottom row positions
        const bottomY = h * 0.65
        leftChip.container.x = 22 + 22
        leftChip.container.y = bottomY
        rightChip.container.x = w - 22 - 22
        rightChip.container.y = bottomY

        vsText.x = w / 2
        vsText.y = bottomY + 4
      }
      layout()

      const ro = new ResizeObserver(() => {
        if (!app) return
        layout()
      })
      if (wrapRef.current) ro.observe(wrapRef.current)
      cleanupFns.push(() => ro.disconnect())

      // ── Helpers: avatar texture loading ─────────────────────────────────
      async function applyAvatar(chip: ChipNodes, url: string) {
        if (chip.currentAvatarUrl === url) return
        chip.currentAvatarUrl = url
        if (!url) {
          chip.avatarHolder.removeChildren()
          return
        }
        try {
          const tex = await Assets.load(url)
          if (!mounted) return
          chip.avatarHolder.removeChildren()
          const sp = new Sprite(tex)
          sp.anchor.set(0.5)
          const min = Math.min(tex.width, tex.height) || 1
          const scale = 44 / min
          sp.scale.set(scale)
          const mask = new Graphics().circle(0, 0, 22).fill(0xffffff)
          chip.avatarHolder.addChild(mask)
          chip.avatarHolder.addChild(sp)
          sp.mask = mask
        } catch {
          /* keep blank — the dark plate already reads as a placeholder */
        }
      }

      // Bind avatar applier so the ticker can fire it when URLs change.
      const applyAvatars = () => {
        const s = stateRef.current
        if (s.left && s.left.avatarUrl !== lastLoadedAvatars.current.left) {
          lastLoadedAvatars.current.left = s.left.avatarUrl
          void applyAvatar(leftChip, s.left.avatarUrl)
        }
        if (s.right && s.right.avatarUrl !== lastLoadedAvatars.current.right) {
          lastLoadedAvatars.current.right = s.right.avatarUrl
          void applyAvatar(rightChip, s.right.avatarUrl)
        }
      }
      applyAvatars()

      // ── Ticker — sync canvas text + visibility to latest props ──────────
      const ticker = (_t: Ticker) => {
        const s = stateRef.current

        // Round counter
        roundLabel.text = `ROUND ${s.currentRound}/${s.totalRounds}`

        // Trophy tally — show only when at least one player has trophies
        const tLeft = s.trophiesLeft ?? 0
        const tRight = s.trophiesRight ?? 0
        if (tLeft + tRight > 0) {
          trophyText.visible = true
          trophyText.text = `🏆 ${tLeft} : ${tRight}`
        } else {
          trophyText.visible = false
        }

        // Chips
        const updateChip = (chip: ChipNodes, p: PlayerChip | null) => {
          if (!p) {
            chip.container.visible = false
            return
          }
          chip.container.visible = true
          // Name — "You" when this side is the local player, else trimmed name.
          const labelName = (p.isMe ? 'You' : p.name).slice(0, 14)
          if (chip.nameText.text !== labelName) chip.nameText.text = labelName
          // Percentage chip — hide when null
          const pctStr = p.pct == null ? '' : `${p.pct}%`
          if (chip.pctText.text !== pctStr) chip.pctText.text = pctStr
          // Score
          const scoreStr = String(p.score)
          if (chip.scoreText.text !== scoreStr) chip.scoreText.text = scoreStr
          // Online dot
          chip.onlineDot.tint = p.online ? 0xFFFFFF : 0x000000 // tint will be overridden by base colour
          chip.onlineDot.alpha = p.online ? 1 : 0.4
          // Switch ring colour for the local player so they always know who they are
          chip.ring.clear()
            .circle(0, 0, 22 + 2)
            .stroke({ color: p.isMe ? ACCENT : ACCENT_2, width: 2, alpha: p.isMe ? 1 : 0.7 })
        }
        updateChip(leftChip, s.left)
        updateChip(rightChip, s.right)

        // Lazy-load avatar textures if URLs have changed since last frame.
        applyAvatars()
      }
      app.ticker.add(ticker)
      cleanupFns.push(() => app?.ticker.remove(ticker))

      // Quiet "unused" warnings for nodes only referenced by the ticker.
      void MUTED
    }

    setup().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[PixelRushHUDCanvas] setup failed', err)
    })

    return () => {
      mounted = false
      cleanupFns.forEach((fn) => { try { fn() } catch { /* ignore */ } })
      cleanupFns = []
      if (app) {
        try { app.destroy(true, { children: true, texture: false }) } catch { /* ignore */ }
      }
    }
    // Rebuild only on identity-level changes; everything else flows via the
    // stateRef → ticker pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30"
      style={{
        paddingTop: 'var(--lm-top-inset)',
        background: '#050B14',
      }}
    >
      <div ref={wrapRef} style={{ width: '100%', height: 118 }} />
    </div>
  )
}
