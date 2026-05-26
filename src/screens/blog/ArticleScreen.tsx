import { Link, useParams } from 'react-router-dom'
import { ARTICLES, getArticle, type Block } from '../../content/articles'
import { useSeo } from '../../lib/seo'
import BlogShell from './BlogShell'

export default function ArticleScreen() {
  const { slug } = useParams<{ slug: string }>()
  const article = getArticle(slug)
  const url = `https://lovemeetapp.com/blog/${slug ?? ''}`

  useSeo({
    title: article ? `${article.title} | Love meet` : 'Article | Love meet',
    description: article?.description ?? 'Love meet blog.',
    canonical: url,
    jsonLd: article
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: article.title,
          description: article.description,
          datePublished: article.date,
          dateModified: article.date,
          mainEntityOfPage: url,
          author: { '@type': 'Organization', name: 'Love meet' },
          publisher: {
            '@type': 'Organization',
            name: 'Love meet',
            logo: { '@type': 'ImageObject', url: 'https://lovemeetapp.com/logo.png' },
          },
        }
      : undefined,
  })

  if (!article) {
    return (
      <BlogShell>
        <div className="text-center py-16">
          <div className="text-4xl mb-2">🔍</div>
          <p className="text-ink font-semibold">Article not found</p>
          <Link to="/blog" className="mt-3 inline-block text-rose font-semibold hover:underline">← Back to the blog</Link>
        </div>
      </BlogShell>
    )
  }

  const others = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3)

  return (
    <BlogShell>
      <article>
        <div className="text-[10px] uppercase tracking-[0.18em] text-rose font-bold">{article.keyword}</div>
        <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold text-ink leading-tight">{article.title}</h1>
        <div className="mt-2 text-[12px] text-ink-muted">
          {new Date(article.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} · {article.readMins} min read
        </div>

        <div className="mt-6 space-y-4">
          {article.blocks.map((b, i) => <BlockView key={i} block={b} />)}
        </div>

        {/* CTA */}
        <div className="mt-8 glass rounded-2xl p-5 text-center">
          <p className="text-ink font-semibold">Ready to meet someone?</p>
          <p className="text-sm text-ink-2 mt-1">Join Love meet free — meet new people, match, chat and play love games.</p>
          <Link to="/" className="mt-3 inline-block rounded-full px-6 py-2.5 bg-gradient-brand text-white font-bold glow-rose">
            Open Love meet
          </Link>
        </div>
      </article>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">Keep reading</h2>
          <ul className="space-y-2">
            {others.map((a) => (
              <li key={a.slug}>
                <Link to={`/blog/${a.slug}`} className="block glass rounded-2xl px-4 py-3 hover:bg-white/[0.04] transition-colors">
                  <span className="text-sm font-semibold text-ink">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </BlogShell>
  )
}

function BlockView({ block }: { block: Block }) {
  if ('h' in block) return <h2 className="text-xl font-extrabold text-ink pt-2">{block.h}</h2>
  if ('ul' in block) {
    return (
      <ul className="list-disc pl-5 space-y-1.5 text-ink-2 leading-relaxed">
        {block.ul.map((li, i) => <li key={i}>{li}</li>)}
      </ul>
    )
  }
  return <p className="text-ink-2 leading-relaxed">{block.p}</p>
}
