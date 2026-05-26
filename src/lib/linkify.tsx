import { Link } from 'react-router-dom'

const URL_RE = /(https?:\/\/[^\s]+)/g

/**
 * Renders text with clickable links. Same-origin URLs (e.g. a shared game
 * invite like https://lovemeetapp.com/play/ABC123) navigate in-app via the
 * router; external URLs open in a new tab. Trailing punctuation is trimmed off
 * the link so "…/play/ABC." doesn't include the dot.
 */
export function Linkify({ text }: { text: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const parts = text.split(URL_RE)

  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>

        // Peel trailing punctuation that isn't part of the URL.
        const m = part.match(/[).,!?;:]+$/)
        const trail = m ? m[0] : ''
        const url = trail ? part.slice(0, -trail.length) : part

        const internal = origin && url.startsWith(origin)
        const cls = 'underline font-semibold break-all'
        const onClick = (e: React.MouseEvent) => e.stopPropagation()

        return (
          <span key={i}>
            {internal ? (
              <Link to={url.slice(origin.length) || '/'} className={cls} onClick={onClick}>{url}</Link>
            ) : (
              <a href={url} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClick}>{url}</a>
            )}
            {trail}
          </span>
        )
      })}
    </>
  )
}
