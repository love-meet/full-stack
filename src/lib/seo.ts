import { useEffect } from 'react'

// SPA per-route SEO: update <title>, meta description, canonical, OG tags and
// an optional JSON-LD block when a page mounts. Googlebot renders the SPA, so
// these are picked up. The static index.html values are the defaults for "/".

type SeoArgs = {
  title: string
  description: string
  canonical?: string
  /** Optional JSON-LD object injected for this route, removed on unmount. */
  jsonLd?: object
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

export function useSeo({ title, description, canonical, jsonLd }: SeoArgs) {
  useEffect(() => {
    document.title = title
    upsertMeta('meta[name="description"]', 'name', 'description', description)
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description)
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    if (canonical) {
      upsertCanonical(canonical)
      upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical)
    }

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-route-seo', 'true')
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => { script?.remove() }
  }, [title, description, canonical, jsonLd])
}
