import { Link } from 'react-router-dom'
import { useMyActiveGame } from '../hooks/usePixelGame'

/** Sticky pill that appears whenever the viewer has an in-progress game.
 *  Shown on the chat list and chat detail so a player can dip out to message
 *  someone and easily jump back to the match. */
export default function ReturnToGameBanner() {
  const g = useMyActiveGame().data
  if (!g) return null
  return (
    <Link
      to={`/play/${g.invite_code}`}
      className="block mx-3 sm:mx-6 mt-2 mb-2 rounded-full px-4 py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose text-center shadow-lg"
    >
      ↩ Return to your {g.status === 'lobby' ? 'game lobby' : 'live game'}
    </Link>
  )
}
