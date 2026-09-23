/**
 * The three documents HS-LM-v1 §07 names as required and currently absent:
 * community guidelines, child-safety standards, and safety guidance.
 *
 * Kept in their own file rather than inlined into LegalScreen because they
 * are the longest prose in the app and the screen is about rendering, not
 * content — and because these are the pages a store reviewer opens, so they
 * want to be easy to find and edit without picking through JSX.
 *
 * Written plainly rather than in legalese. A reviewer reads these; so does a
 * frightened nineteen-year-old at two in the morning. Both are better served
 * by sentences than by clauses.
 */
export type Section = { heading: string; body: string }
export type Doc = { title: string; subtitle: string; sections: Section[] }

export const GUIDELINES: Doc = {
  title: 'Community guidelines',
  subtitle: 'What is welcome here, and what gets you removed.',
  sections: [
    {
      heading: 'Be a person, not a pitch',
      body: 'Love meet is for meeting people. Advertising, recruiting, promoting a channel, or steering a conversation towards an investment, a crypto scheme or a job offer is not allowed, and it is the most common reason an account is removed.',
    },
    {
      heading: 'Your pictures must be yours',
      body: "Use photographs of yourself. Not someone else's, not a celebrity, not an image you found online. If you would rather not show your face, use the illustrated avatar we offer — that is a real choice, not a penalty.",
    },
    {
      heading: 'Nothing explicit',
      body: 'No nudity, no sexual content, nothing suggestive in a profile picture or gallery. Profile pictures are reviewed. This is not prudishness: one explicit image gets the whole app pulled from the stores, which ends it for everybody.',
    },
    {
      heading: 'No harassment, hate or threats',
      body: 'Do not keep contacting someone who has stopped replying. Do not insult people for their race, religion, nationality, disability, gender or who they are attracted to. Threats of violence are reported to the authorities as well as removed.',
    },
    {
      heading: 'Over 18 only',
      body: 'You must be 18 or over. An account we believe belongs to a minor is removed immediately and without warning, and we do not need to be certain before we act.',
    },
    {
      heading: 'What happens if you break these',
      body: 'Depending on what happened: the content comes down, the picture comes down, the account is suspended, or it is removed for good. Anything involving a child or a credible threat goes to law enforcement as well.',
    },
  ],
}

export const CHILD_SAFETY: Doc = {
  title: 'Child safety standards',
  subtitle: 'Our policy on child sexual abuse and exploitation.',
  sections: [
    {
      heading: 'Love meet is strictly 18+',
      body: 'Every account gives a date of birth at signup and anyone under 18 is refused. There is no version of this app for minors, and we do not want under-18 users.',
    },
    {
      heading: 'Zero tolerance',
      body: 'Child sexual abuse material, and any attempt to solicit, groom or sexualise a minor, is forbidden on Love meet. There is no warning and no second chance: the account is removed, the evidence is preserved, and the matter is reported.',
    },
    {
      heading: 'How to report it',
      body: 'Use the ⋯ menu on the profile, photograph or message, or email lovemeet@highzcore.tech with the handle and what you saw. Reports of this kind are handled ahead of everything else. If a child is in immediate danger, contact your local police first.',
    },
    {
      heading: 'What we do when we find it',
      body: 'We remove the account and its content, retain the evidence and account records as the law requires, and report to the relevant authority — in Nigeria the NPF National Cybercrime Centre, and to NCMEC where the applicable law provides for it.',
    },
    {
      heading: 'Prevention',
      body: 'Profile pictures are queued for review, an account believed to belong to a minor is removed on suspicion rather than on proof, and every profile, photograph and message carries an in-app block and report control.',
    },
    {
      heading: 'Named contact',
      body: 'Child-safety point of contact: Victor Otung, Highscore Tech (RC 7223102), Lagos, Nigeria — lovemeet@highzcore.tech. We aim to respond to a child-safety report within 24 hours.',
    },
  ],
}

export const SAFETY: Doc = {
  title: 'Staying safe',
  subtitle: 'Meeting someone from the internet, sensibly.',
  sections: [
    {
      heading: 'Take your time online first',
      body: 'There is no rush to meet. Talk in the app, play a few rounds of something, see whether the person stays consistent. Somebody pushing hard to move to another app, or to meet immediately, is telling you something.',
    },
    {
      heading: 'Meet in public the first few times',
      body: 'A café, a restaurant, somewhere with other people and staff. Not their home, not yours, and nowhere you would struggle to walk out of.',
    },
    {
      heading: 'Tell somebody where you are going',
      body: 'A friend or a relative should know who you are meeting, where, and when you expect to be back. Share your live location with them for the evening.',
    },
    {
      heading: 'Arrange your own travel',
      body: 'Get yourself there and back. Do not be collected from your home on a first meeting, and keep enough charge and money to leave on your own at any moment.',
    },
    {
      heading: 'Nobody here needs your money',
      body: 'Anyone asking you for money, a bank transfer, crypto, gift cards or help with a "customs fee" is running a scam — whatever the story is, and however many weeks they spent building up to it. Report them and stop replying.',
    },
    {
      heading: 'Guard your details',
      body: 'Keep your home address, workplace, bank details and identity documents out of chat. Staff will never ask for your password or your PIN.',
    },
    {
      heading: 'If something feels wrong',
      body: 'Leave. You do not owe anyone an explanation or a polite ending. Block them from the ⋯ menu — they are not told — and report the account so we can look at it.',
    },
  ],
}
