import { Fragment } from 'react'
import { Link } from 'react-router-dom'

/**
 * Parses a comment string and replaces @handles with react-router Links.
 * Does not check if the handle actually exists in the DB — assumes the string
 * was saved with a valid handle (since the composer inserts valid ones).
 * Missing handles just link to a 404 profile.
 */
export default function CommentBody({ text }: { text: string }) {
  if (!text) return null

  // Split by @handle word boundaries. 
  // Pattern: (@ followed by 1 or more word characters)
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@') && part.length > 1) {
          const handle = part.slice(1) // remove @
          return (
            <Link
              key={i}
              to={`/profile/handle/${handle}`} // Assuming your routing supports /profile/handle/:handle or you map it
              className="text-brand font-bold hover:underline"
              onClick={(e) => e.stopPropagation()} // in case the comment is in a clickable area
            >
              {part}
            </Link>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
