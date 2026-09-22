import type { CropArea } from './types'

type Props = {
  src: string
  naturalWidth: number
  naturalHeight: number
  /** The crop window in source-image pixels. If null, the whole image renders. */
  area: CropArea | null
  filter?: string
  className?: string
  /** Container style — typically width/height. The aspect-ratio is set from `area`. */
  style?: React.CSSProperties
}

/**
 * Renders the visible region of an image as defined by `area`, with the given
 * CSS `filter` applied. Used by EditStep + ComposeStep to keep the post
 * preview consistent with the Cropper's current selection.
 */
export default function CroppedImage({
  src,
  naturalWidth,
  naturalHeight,
  area,
  filter,
  className,
  style,
}: Props) {
  if (!area || area.width <= 0 || area.height <= 0) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        style={{ ...style, filter, objectFit: 'cover' }}
      />
    )
  }

  // The container is the FRAME at `area`'s aspect; the image inside is
  // positioned so only `area` shows. Percentages let it scale with the
  // container — no measurement effects required.
  const ratio = area.width / area.height
  const widthPct  = (naturalWidth  / area.width)  * 100
  const heightPct = (naturalHeight / area.height) * 100
  const leftPct   = -(area.x / area.width)  * 100
  const topPct    = -(area.y / area.height) * 100

  return (
    <div
      className={className}
      style={{
        ...style,
        aspectRatio: String(ratio),
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          position: 'absolute',
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
          filter,
          maxWidth: 'none',
          maxHeight: 'none',
        }}
      />
    </div>
  )
}
