import { Link } from 'react-router-dom'

/**
 * The landing-page footer — HS-LM-v1 §02.
 *
 * "Privacy policy, terms, child-safety standards, community guidelines,
 * contact, and the company name and RC number."
 *
 * Every item there is a store requirement rather than a nicety. Google will
 * not pass a dating app without a reachable child-safety policy, and both
 * stores look for the operating company to be named — an app whose publisher
 * is anonymous reads as one that intends to be hard to complain about.
 *
 * These are real routes, not placeholder anchors: a footer link that goes
 * nowhere is worse than no footer, because a reviewer clicks them.
 */
const LEGAL = [
  { to: '/legal/privacy', label: 'Privacy policy' },
  { to: '/legal/terms', label: 'Terms of service' },
  { to: '/legal/guidelines', label: 'Community guidelines' },
  { to: '/legal/child-safety', label: 'Child safety' },
  { to: '/legal/safety', label: 'Staying safe' },
  { to: '/legal/help', label: 'Help' },
]

const COMPANY = {
  name: 'Highscore Tech',
  rc: 'RC 7223102',
  place: 'Lagos, Nigeria',
  email: 'lovemeet@highzcore.tech',
}

export default function SiteFooter() {
  return (
    <footer className="relative z-10 px-6 pb-14 pt-6 border-t border-white/8">
      <div className="max-w-5xl mx-auto">
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {LEGAL.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-xs font-semibold text-ink-2 hover:text-rose transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <a
            href={`mailto:${COMPANY.email}`}
            className="text-xs font-semibold text-ink-2 hover:text-rose transition-colors"
          >
            Contact
          </a>
        </nav>

        <p className="mt-6 text-center text-[11px] text-ink-muted leading-relaxed">
          {COMPANY.name} · {COMPANY.rc} · {COMPANY.place}
          <br />
          Love meet is 18+. Coins buy messaging inside the app; they have no
          cash value and cannot be withdrawn or transferred.
        </p>
      </div>
    </footer>
  )
}
