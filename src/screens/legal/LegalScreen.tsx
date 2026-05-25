import { useNavigate, useParams } from 'react-router-dom'

type Kind = 'privacy' | 'terms' | 'about' | 'help'

const COPY: Record<Kind, { title: string; subtitle: string; sections: Section[] }> = {
  privacy: {
    title: 'Privacy policy',
    subtitle: 'How we handle your data on Love meet.',
    sections: [
      {
        heading: 'What we collect',
        body: `When you sign up we store the minimum needed to run the app: your handle, display name, avatar, date of birth (for age gating), gender, the broad area you live in (country/region), and the messages you send. We don't sell any of this to advertisers.`,
      },
      {
        heading: 'Where it lives',
        body: `Your profile and messages are stored in our Supabase database (Postgres). Media (photos and videos) goes to Cloudinary. Both are encrypted in transit and at rest. Direct messages aren't end-to-end encrypted yet — we plan to switch to E2EE for chat in a future release.`,
      },
      {
        heading: 'Who can see what',
        body: `Your profile and posts are visible to other signed-in users on the platform. Direct messages are visible only to you and the other person in the conversation — enforced at the database level via row-level security. Blocked users can't see your posts or message you.`,
      },
      {
        heading: 'Third parties',
        body: `We use Supabase (auth + database + realtime), Cloudinary (media), Google (sign-in OAuth), and Telegram (for the Mini-App login flow + bot notifications). Each has its own privacy policy that governs how they handle the data we hand off.`,
      },
      {
        heading: 'Your rights',
        body: `You can edit any profile field from Settings → Edit profile. You can delete your own posts and messages at any time. Account deletion is being wired up in the next release; until then, message support@lovemeet.app if you want your account closed immediately.`,
      },
      {
        heading: 'Cookies',
        body: `We only use cookies that are strictly necessary to keep you signed in (Supabase's auth session). No analytics cookies, no tracking pixels.`,
      },
      {
        heading: 'Contact',
        body: `Questions or requests: support@lovemeet.app.`,
      },
    ],
  },
  terms: {
    title: 'Terms of service',
    subtitle: 'The rules for using Love meet.',
    sections: [
      {
        heading: 'Who can use Love meet',
        body: `You must be at least 18 years old to use Love meet. By creating an account you confirm that you're an adult and that the date of birth you give us is accurate. We will close accounts found to be under 18.`,
      },
      {
        heading: 'Be decent to other users',
        body: `No harassment, hate speech, doxxing, threats, or content involving minors. No impersonation of other real people. No automation or scraping of profiles or messages. Repeated violations result in a permanent ban.`,
      },
      {
        heading: 'Content you post',
        body: `You keep ownership of anything you upload. By posting it on Love meet you give us a non-exclusive license to display it inside the app so other users can see it. If you delete a post, we stop serving it within minutes.`,
      },
      {
        heading: 'The Naughty room',
        body: `The "Naughty 18+" section in Explore contains adult content. It's gated behind an explicit age confirmation. On iOS the Naughty room is hidden entirely per Apple's review guidelines.`,
      },
      {
        heading: 'Gifts, tips, and earnings',
        body: `Gifts sent via the gift sheet are credited to the recipient's earnings balance, which they can withdraw once the payments stack ships. Sending a gift is a non-refundable purchase. Earnings paid out as crypto (USDT-TRC20) may incur a small network fee.`,
      },
      {
        heading: 'Account suspension',
        body: `We may suspend or close any account that breaks these rules, with or without notice. We'll generally try to give a warning first for minor issues; serious violations (CSAM, threats, fraud) are instant bans.`,
      },
      {
        heading: 'Limitation of liability',
        body: `Love meet is provided as-is. We do our best to keep the service running and your data safe, but we can't guarantee it'll be available 24/7 or that bugs never happen. We're not liable for any indirect or consequential damages arising from your use of the app.`,
      },
      {
        heading: 'Changes',
        body: `If we make material changes to these terms, we'll notify you in-app at least seven days before they take effect.`,
      },
    ],
  },
  about: {
    title: 'About Love meet',
    subtitle: 'Why we built it and where it’s going.',
    sections: [
      {
        heading: 'What it is',
        body: `Love meet is a place to meet people for relationships, dating, friendship, or just conversation. It's built around three feeds — your main scroll, the topical "Explore" rooms (pickup lines, advice, the 18+ Naughty room), and direct chat — so finding interesting people takes one tap, not ten.`,
      },
      {
        heading: 'Why we rebuilt',
        body: `The original app shipped as separate iOS, Android, and web codebases on Express + MongoDB. After the Play Store account was restricted in late 2025, we collapsed everything into a single Vite + Supabase codebase that runs on iOS, web, and inside Telegram as a Mini-App.`,
      },
      {
        heading: 'How calls and chat work',
        body: `Direct messages are realtime over Supabase's Postgres replication channel — no separate Socket.io server. The chat list, typing indicators, read receipts, and online dots all run on the same channel. Voice and video calls are being added with WebRTC, using Supabase Realtime as the signaling layer.`,
      },
      {
        heading: 'Open questions',
        body: `End-to-end encryption for chat. Federated content moderation. Group video. Reach out if any of these sound interesting to work on.`,
      },
      {
        heading: 'Credits',
        body: `Designed and built by the Love meet team. Bug reports + feature requests: support@lovemeet.app.`,
      },
    ],
  },
  help: {
    title: 'Help & support',
    subtitle: 'Stuck on something? Start here.',
    sections: [
      {
        heading: 'Contact us',
        body: `The fastest way to reach a human is email: support@lovemeet.app. Include your handle and, if it's about a payment, the LM- reference shown on the deposit or withdrawal. We usually reply within 24 hours.`,
      },
      {
        heading: 'Deposits not showing up',
        body: `Bank-transfer (Wema) and card (Flutterwave) deposits are confirmed manually or by webhook and can take a few minutes. If a transfer hasn't credited after an hour, email us the LM- reference and a screenshot of the transfer. USDT (TRC-20) deposits confirm once the network does — usually a minute or two.`,
      },
      {
        heading: 'Withdrawals',
        body: `Withdrawals are reviewed before the on-chain transfer is signed, so they aren't instant. Make sure your TRC-20 address is correct — crypto transfers can't be reversed. You can see the status of any withdrawal in Menu → Withdraw.`,
      },
      {
        heading: 'Safety',
        body: `Never share your password or PIN with anyone — staff will never ask for them. If someone on the app is harassing you, use the ⋯ menu on their chat or profile to block them, and report any rule-breaking posts via the post's ⋯ menu. Reports go straight to our moderation team.`,
      },
      {
        heading: 'Lost access to your account',
        body: `If you signed in with Google or Telegram, just sign in again with the same provider. If you set a password and forgot it, email support@lovemeet.app from the address on your account.`,
      },
    ],
  },
}

type Section = { heading: string; body: string }

export default function LegalScreen() {
  const navigate = useNavigate()
  const { kind = 'privacy' } = useParams<{ kind: Kind }>()
  const doc = COPY[kind as Kind] ?? COPY.privacy

  return (
    <div className="min-h-screen text-ink">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">{doc.title}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-5 sm:px-8 py-6 pb-24">
        <h1 className="text-3xl font-extrabold text-gradient-warm tracking-tight">
          {doc.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{doc.subtitle}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink-muted font-bold">
          Last updated · 2026-05-19
        </p>

        <div className="mt-8 space-y-7">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-extrabold text-ink mb-1.5">{s.heading}</h2>
              <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
