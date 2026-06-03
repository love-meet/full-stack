/**
 * PixelRushCanvas — the gameplay surface for Pixel Rush, rendered through
 * PixiJS (HTML5 canvas) rather than DOM divs.
 *
 * Drop-in replacement for `PixelBoard` (same props, same callbacks). The
 * scene is composed of three layers:
 *
 *   bgLayer    — the Pixel Rush artwork blurred, dimmed and tinted to the
 *                game's cyan/teal accent so the gameplay always reads as
 *                "Pixel Rush" regardless of which photo is being rebuilt.
 *   puzzleLayer — N sprites, each showing one rectangular slice of the
 *                target image. Drag any sprite onto another (or tap two)
 *                to swap them.
 *   hudLayer   — preview countdown ("3"/"2"/"1"), themed glow on the
 *                selected tile, and the win-celebration sparkles.
 *
 * The component DOES NOT re-create the Pixi Application on every render —
 * the scene's heavy state (textures, sprites, ticker) lives in refs and is
 * rebuilt only when image/seed/grid actually change. Latest callback refs
 * are kept in `stateRef` so the canvas effect doesn't have to re-run when
 * the parent re-renders.
 */

import { useEffect, useRef } from 'react'
import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  Ticker,
  type FederatedPointerEvent,
} from 'pixi.js'

const PREVIEW_MS = 5000
const ACCENT = 0x35CDE8     // cyan accent from the Pixel Rush artwork (LIVE badge)
const ACCENT_2 = 0x6CE8FA   // lighter cyan for highlights
const BG_DARK = 0x0A1A2C    // dark navy wash behind the puzzle

type Props = {
  image: string
  seed: number
  grid: number
  startedAt: number
  locked: boolean
  onSolve: (timeMs: number) => void
  onProgress?: (order: number[], done: boolean) => void
}

export default function PixelRushCanvas({
  image,
  seed,
  grid,
  startedAt,
  locked,
  onSolve,
  onProgress,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Latest props/callbacks stay in a ref so the canvas effect doesn't tear
  // down and rebuild every time the parent re-renders.
  const propsRef = useRef({ onSolve, onProgress, locked, startedAt })
  propsRef.current = { onSolve, onProgress, locked, startedAt }

  useEffect(() => {
    let mounted = true
    let app: Application | null = null
    let cleanupFns: Array<() => void> = []
    const raceStart = startedAt + PREVIEW_MS

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
      // Block default touch behaviour so dragging tiles doesn't scroll the
      // page on mobile.
      app.canvas.style.touchAction = 'none'

      // ── Load textures in parallel ───────────────────────────────────────
      const [puzzleTex, themeTex] = await Promise.all([
        Assets.load(image),
        Assets.load('/pixel-rush.png').catch(() => null),
      ])
      if (!mounted || !app) { app?.destroy(true); return }

      // ── Layers ──────────────────────────────────────────────────────────
      const bgLayer = new Container()
      const puzzleLayer = new Container()
      const hudLayer = new Container()
      app.stage.addChild(bgLayer)
      app.stage.addChild(puzzleLayer)
      app.stage.addChild(hudLayer)

      // ── Themed background ───────────────────────────────────────────────
      // Dark navy plate + the artwork blurred behind it + a cyan vignette
      // glow so the gameplay frame always reads as Pixel Rush.
      const W = () => app!.screen.width
      const H = () => app!.screen.height

      const plate = new Graphics().rect(0, 0, W(), H()).fill({ color: BG_DARK, alpha: 0.92 })
      bgLayer.addChild(plate)

      if (themeTex) {
        const themeSprite = new Sprite(themeTex)
        themeSprite.alpha = 0.18
        themeSprite.tint = ACCENT_2
        themeSprite.filters = [new BlurFilter({ strength: 14 })]
        const fitTheme = () => {
          themeSprite.width = W() * 1.15
          themeSprite.height = (themeTex.height / themeTex.width) * themeSprite.width
          themeSprite.x = (W() - themeSprite.width) / 2
          themeSprite.y = (H() - themeSprite.height) / 2
        }
        fitTheme()
        bgLayer.addChild(themeSprite)
        cleanupFns.push(() => fitTheme())
      }

      // Cyan corner glows
      const glow = new Graphics()
        .circle(0, 0, Math.max(W(), H()) * 0.55)
        .fill({ color: ACCENT, alpha: 0.10 })
      glow.x = W() * 0.05
      glow.y = H() * 0.05
      glow.filters = [new BlurFilter({ strength: 28 })]
      bgLayer.addChild(glow)

      const glow2 = new Graphics()
        .circle(0, 0, Math.max(W(), H()) * 0.55)
        .fill({ color: ACCENT_2, alpha: 0.08 })
      glow2.x = W() * 0.95
      glow2.y = H() * 0.95
      glow2.filters = [new BlurFilter({ strength: 28 })]
      bgLayer.addChild(glow2)

      // ── Puzzle ──────────────────────────────────────────────────────────
      // Lay out the grid centered on the canvas. The puzzle takes ~88% of
      // the smaller viewport dimension so there's a comfortable themed
      // border around it.
      const N = grid * grid
      const order = identity(N) // starts as identity; preview shows whole image

      const tileSrcW = puzzleTex.width / grid
      const tileSrcH = puzzleTex.height / grid

      // Pre-create one Texture per source position (0..N-1) so we don't
      // re-allocate when tiles swap.
      const sourceTextures: Texture[] = []
      for (let i = 0; i < N; i++) {
        const r = Math.floor(i / grid)
        const c = i % grid
        sourceTextures.push(
          new Texture({
            source: puzzleTex.source,
            frame: new Rectangle(c * tileSrcW, r * tileSrcH, tileSrcW, tileSrcH),
          }),
        )
      }

      // Build N sprites — one per slot. Tile content is whatever value
      // `order[slot]` holds (so swapping order[] re-textures the sprites
      // rather than moving sprites around).
      const tileSprites: Sprite[] = []
      const selectedRings: Graphics[] = []
      // Parallel drag-state array — typed cleanly rather than monkey-patched
      // onto each Sprite. Indexed by slot.
      type DragState = {
        isDragging: boolean
        startX: number
        startY: number
        originX: number
        originY: number
        moved: boolean
      }
      const drag: DragState[] = []
      for (let i = 0; i < N; i++) {
        drag.push({ isDragging: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false })
      }

      // Highlight (cyan ring) sits BEHIND every tile so we can pop it on
      // when the tile is selected without re-ordering the display list.
      for (let slot = 0; slot < N; slot++) {
        const ring = new Graphics()
        ring.visible = false
        puzzleLayer.addChild(ring)
        selectedRings.push(ring)

        const sp = new Sprite(sourceTextures[order[slot]])
        sp.anchor.set(0.5)
        sp.eventMode = 'static'
        sp.cursor = 'grab'
        puzzleLayer.addChild(sp)
        tileSprites.push(sp)
      }

      // Layout helpers — recomputed on every resize.
      let tileSize = 0
      let originX = 0
      let originY = 0
      const GAP = 4

      function layout() {
        const side = Math.min(W(), H()) * 0.88
        tileSize = (side - GAP * (grid - 1)) / grid
        originX = (W() - side) / 2 + tileSize / 2
        originY = (H() - side) / 2 + tileSize / 2

        for (let slot = 0; slot < N; slot++) {
          const r = Math.floor(slot / grid)
          const c = slot % grid
          const x = originX + c * (tileSize + GAP)
          const y = originY + r * (tileSize + GAP)
          const sp = tileSprites[slot]
          if (!drag[slot].isDragging) {
            sp.x = x
            sp.y = y
          }
          sp.width = tileSize
          sp.height = tileSize

          const ring = selectedRings[slot]
          ring.x = x
          ring.y = y
          ring.clear()
            .roundRect(-tileSize / 2 - 5, -tileSize / 2 - 5, tileSize + 10, tileSize + 10, 12)
            .stroke({ color: ACCENT, width: 3, alpha: 0.95 })
        }
      }
      layout()

      const resizeObs = new ResizeObserver(() => {
        if (!app) return
        layout()
      })
      if (wrapRef.current) resizeObs.observe(wrapRef.current)
      cleanupFns.push(() => resizeObs.disconnect())

      // ── State that the interaction needs to mutate ──────────────────────
      type Phase = 'preview' | 'play' | 'solved'
      let phase: Phase = 'preview'
      let selected: number | null = null
      const orderState = order.slice()

      // Update sprite-at-slot to show tile id `tileId`, with a brief tween
      // so swaps feel snappy but visible. Returns immediately if the slot's
      // sprite is currently being dragged (drop-zone reassignment is done
      // separately).
      function setSlotTile(slot: number, tileId: number) {
        const sp = tileSprites[slot]
        sp.texture = sourceTextures[tileId]
      }

      function applyOrder() {
        for (let slot = 0; slot < N; slot++) {
          setSlotTile(slot, orderState[slot])
        }
      }

      function setSelected(slot: number | null) {
        if (selected != null) selectedRings[selected].visible = false
        selected = slot
        if (selected != null) selectedRings[selected].visible = true
      }

      function isSolvedNow(): boolean {
        for (let i = 0; i < N; i++) if (orderState[i] !== i) return false
        return true
      }

      let solveFired = false
      function checkSolved() {
        if (solveFired) return
        if (!isSolvedNow()) return
        solveFired = true
        phase = 'solved'
        setSelected(null)
        propsRef.current.onSolve(Math.max(0, Date.now() - raceStart))
        celebrate()
      }

      function emitProgress() {
        propsRef.current.onProgress?.(orderState.slice(), isSolvedNow())
      }

      function swap(a: number, b: number) {
        if (a === b) return
        ;[orderState[a], orderState[b]] = [orderState[b], orderState[a]]
        setSlotTile(a, orderState[a])
        setSlotTile(b, orderState[b])
        emitProgress()
        checkSolved()
      }

      // ── Drag interaction ────────────────────────────────────────────────
      // Pointer-based: works for mouse, touch, pen. PixiJS routes all of
      // them through the same `pointer*` events.
      function nearestSlot(x: number, y: number): number {
        // Snap to grid based on canvas-relative coordinates.
        const cellPitch = tileSize + GAP
        const localX = x - (originX - tileSize / 2)
        const localY = y - (originY - tileSize / 2)
        const c = clamp(Math.floor(localX / cellPitch), 0, grid - 1)
        const r = clamp(Math.floor(localY / cellPitch), 0, grid - 1)
        return r * grid + c
      }

      // Drag state lives in the parallel `drag` array (typed) — pointerdown
      // captures the start position so we can compute offset later.
      for (let slot = 0; slot < N; slot++) {
        const sp = tileSprites[slot]
        const slotIdx = slot // captured for the closure
        sp.on('pointerdown', (e: FederatedPointerEvent) => {
          if (phase !== 'play' || propsRef.current.locked) return
          const d = drag[slotIdx]
          d.isDragging = true
          d.startX = sp.x
          d.startY = sp.y
          d.originX = e.global.x
          d.originY = e.global.y
          d.moved = false
          // Bring the dragged sprite to the front.
          puzzleLayer.removeChild(sp)
          puzzleLayer.addChild(sp)
          sp.cursor = 'grabbing'
        })
      }

      // Stage-level move/up — captures pointer events regardless of where
      // they happen, including off-tile, so the drag doesn't get "stuck".
      app.stage.eventMode = 'static'
      app.stage.hitArea = new Rectangle(0, 0, W() * 100, H() * 100) // generous

      app.stage.on('pointermove', (e: FederatedPointerEvent) => {
        for (let slot = 0; slot < N; slot++) {
          const d = drag[slot]
          if (!d.isDragging) continue
          const sp = tileSprites[slot]
          const dx = e.global.x - d.originX
          const dy = e.global.y - d.originY
          if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true
          sp.x = d.startX + dx
          sp.y = d.startY + dy
        }
      })

      function endDrag(e: FederatedPointerEvent) {
        for (let slot = 0; slot < N; slot++) {
          const d = drag[slot]
          if (!d.isDragging) continue
          const sp = tileSprites[slot]
          d.isDragging = false
          sp.cursor = 'grab'

          if (!d.moved) {
            // Tap — toggle selection / complete a tap-swap.
            if (selected === null) {
              setSelected(slot)
            } else if (selected === slot) {
              setSelected(null)
            } else {
              const from = selected
              setSelected(null)
              swap(from, slot)
            }
            // Snap sprite back to its slot position (in case of small jitter).
            const r = Math.floor(slot / grid)
            const c = slot % grid
            sp.x = originX + c * (tileSize + GAP)
            sp.y = originY + r * (tileSize + GAP)
          } else {
            // Drop — figure out which slot it landed on, swap if different.
            const target = nearestSlot(e.global.x, e.global.y)
            // Always snap back first so the swap tween reads cleanly.
            const r = Math.floor(slot / grid)
            const c = slot % grid
            sp.x = originX + c * (tileSize + GAP)
            sp.y = originY + r * (tileSize + GAP)
            if (target !== slot) {
              setSelected(null)
              swap(slot, target)
            }
          }
        }
      }
      app.stage.on('pointerup', endDrag)
      app.stage.on('pointerupoutside', endDrag)

      // ── Preview countdown ───────────────────────────────────────────────
      const countdownText = new Text({
        text: '',
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: Math.min(W(), H()) * 0.18,
          fontWeight: '900',
          fill: 0xffffff,
          dropShadow: {
            color: 0x000000,
            blur: 8,
            angle: Math.PI / 2,
            distance: 4,
            alpha: 0.6,
          },
        },
      })
      countdownText.anchor.set(0.5)
      countdownText.x = W() / 2
      countdownText.y = H() / 2
      hudLayer.addChild(countdownText)

      // ── Win sparkles ────────────────────────────────────────────────────
      type Sparkle = { g: Graphics; vx: number; vy: number; vr: number; life: number }
      const sparkles: Sparkle[] = []
      const sparkleContainer = new Container()
      hudLayer.addChild(sparkleContainer)

      function celebrate() {
        for (let i = 0; i < 40; i++) {
          const g = new Graphics()
            .star(0, 0, 5, 6, 3)
            .fill({ color: i % 2 ? ACCENT : ACCENT_2 })
          g.x = W() / 2 + (Math.random() - 0.5) * 30
          g.y = H() / 2 + (Math.random() - 0.5) * 30
          sparkleContainer.addChild(g)
          sparkles.push({
            g,
            vx: (Math.random() - 0.5) * 9,
            vy: -Math.random() * 10 - 3,
            vr: (Math.random() - 0.5) * 0.4,
            life: 1,
          })
        }
      }

      // ── Ticker — animation loop ─────────────────────────────────────────
      const ticker = (t: Ticker) => {
        // Preview countdown
        if (phase === 'preview') {
          const remainingMs = raceStart - Date.now()
          if (remainingMs <= 0) {
            // Scatter time
            const scrambled = seededShuffle(seed, N)
            for (let i = 0; i < N; i++) orderState[i] = scrambled[i]
            applyOrder()
            phase = 'play'
            countdownText.text = ''
            emitProgress()
          } else {
            countdownText.text = String(Math.ceil(remainingMs / 1000))
            // Pulse — gentle scale to draw the eye.
            const pulse = 1 + 0.06 * Math.sin(Date.now() / 200)
            countdownText.scale.set(pulse)
          }
        }

        // Selected-tile breathing glow.
        if (selected != null) {
          const ring = selectedRings[selected]
          ring.alpha = 0.7 + 0.3 * Math.sin(Date.now() / 220)
        }

        // Win sparkles physics — iterate the typed array, destroy expired.
        const dt = t.deltaTime
        for (let i = sparkles.length - 1; i >= 0; i--) {
          const s = sparkles[i]
          s.g.x += s.vx * dt
          s.g.y += s.vy * dt
          s.vy += 0.35 * dt // gravity
          s.g.rotation += s.vr * dt
          s.life -= 0.012 * dt
          s.g.alpha = Math.max(0, s.life)
          if (s.life <= 0) {
            sparkleContainer.removeChild(s.g)
            s.g.destroy()
            sparkles.splice(i, 1)
          }
        }
      }
      app.ticker.add(ticker)
      cleanupFns.push(() => app?.ticker.remove(ticker))
    }

    setup().catch((err) => {
      console.error('[PixelRushCanvas] setup failed', err)
    })

    return () => {
      mounted = false
      cleanupFns.forEach((fn) => { try { fn() } catch { /* ignore */ } })
      cleanupFns = []
      if (app) {
        try { app.destroy(true, { children: true, texture: false }) } catch { /* ignore */ }
      }
    }
    // image/seed/grid change → rebuild scene completely; startedAt changes
    // are picked up via propsRef without rebuilding.
  }, [image, seed, grid])

  return (
    <div
      ref={wrapRef}
      className="relative w-full aspect-square max-w-md mx-auto rounded-[18px] overflow-hidden"
      style={{
        boxShadow:
          '0 18px 40px -18px rgba(0,0,0,0.65), 0 4px 10px -4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
        border: '1px solid rgba(53, 205, 232, 0.22)',
      }}
    />
  )
}

// ── pure helpers ──────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function identity(n: number): number[] {
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = i
  return out
}

function isSolvedArr(a: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== i) return false
  return true
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(seed: number, n: number): number[] {
  const rand = mulberry32(seed)
  const a = identity(n)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return isSolvedArr(a) ? seededShuffle(seed + 1, n) : a
}

