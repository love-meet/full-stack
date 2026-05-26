import { Link } from 'react-router-dom'
import { ARTICLES } from '../../content/articles'
import { useSeo } from '../../lib/seo'
import BlogShell from './BlogShell'

export default function BlogScreen() {
  useSeo({
    title: 'Love meet Blog — Love Games, Dating Tips & Relationship Advice',
    description:
      'Love games, picnic date ideas, dating tips and relationship advice from Love meet — the free dating app to meet new people, match and chat.',
    canonical: 'https://lovemeetapp.com/blog',
  })

  return (
    <BlogShell>
      <header className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-warm">The Love meet Blog</h1>
        <p className="mt-2 text-ink-2">
          Love games, dating tips and relationship advice to help you meet, match and connect.
        </p>
      </header>

      <ul className="space-y-4">
        {ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link
              to={`/blog/${a.slug}`}
              className="block glass rounded-2xl p-5 hover:bg-white/[0.04] transition-colors"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-rose font-bold">{a.keyword}</div>
              <h2 className="mt-1 text-lg font-extrabold text-ink">{a.title}</h2>
              <p className="mt-1 text-sm text-ink-2">{a.description}</p>
              <div className="mt-2 text-[11px] text-ink-muted">{a.readMins} min read</div>
            </Link>
          </li>
        ))}
      </ul>
    </BlogShell>
  )
}
