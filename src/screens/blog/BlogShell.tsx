import { Link } from 'react-router-dom'

/** Public, lightweight layout for the blog (no app shell / auth). Crawlable. */
export default function BlogShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-ink bg-surface">
      <header className="border-b border-white/5">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Love meet" className="h-7 w-auto" />
            <span className="font-extrabold tracking-tight text-gradient-warm text-lg">Love meet</span>
          </Link>
          <Link
            to="/"
            className="rounded-full px-4 py-1.5 text-sm font-bold bg-gradient-brand text-white glow-rose"
          >
            Open app
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-8">{children}</main>

      <footer className="border-t border-white/5 mt-8">
        <div className="max-w-2xl mx-auto px-5 py-6 text-sm text-ink-muted flex flex-wrap gap-x-4 gap-y-2 justify-center">
          <Link to="/blog" className="hover:text-rose">Blog</Link>
          <Link to="/" className="hover:text-rose">Home</Link>
          <Link to="/legal/about" className="hover:text-rose">About</Link>
          <Link to="/legal/privacy" className="hover:text-rose">Privacy</Link>
          <Link to="/legal/terms" className="hover:text-rose">Terms</Link>
        </div>
        <p className="text-center text-[11px] text-ink-muted pb-6">© Love meet · Made with 💕</p>
      </footer>
    </div>
  )
}
