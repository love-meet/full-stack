/**
 * Mirror of the server-side _detect_offplatform_contact() function (v3).
 * Lets the composer warn BEFORE sending so users learn what's not allowed
 * without triggering a server rejection. Server is still the source of truth.
 */
export type ChatViolation =
  | 'email' | 'phone' | 'platform_url' | 'platform_handle' | 'platform_intent'

/** ANY standalone mention of a major off-platform service or its common
 *  misspelling counts as a migration attempt — see the migration comment. */
const PLATFORM_NAMES = new RegExp(
  '\\b(' +
    'whatsapp|whatsap|whatapp|whatsup|watsapp|watsap|whatsaap|wsap|wsapp|wassap|wassapp|' +
    'telegram|telgram|tlegram|tlgrm|' +
    'snapchat|snapcat|snapchatt|snap\\s*chat|' +
    'discord|signal\\s*app|skype|skyp|viber|kakao|wechat|imessage|messenger|' +
    'instagram|instgram|isntagram|tiktok|tik\\s*tok|' +
    'gmail|protonmail|yahoo\\s*mail|hotmail|icloud|outlook\\s*mail' +
  ')\\b',
  'i',
)

const PLATFORM_URLS = /(wa\.me\/|api\.whatsapp\.com|t\.me\/|telegram\.me\/|tg:\/\/|signal\.me\/|snapchat\.com\/|sc\.com\/|m\.me\/|fb\.me\/|messenger\.com\/|kakao\.com\/|line\.me\/|wechat\.com\/|skype:|imessage:|viber:|discord\.gg\/|discord\.com\/users\/)/i

const MIGRATION_INTENT = /(give\s+me\s+your\s+(number|digits|contact)|drop\s+your\s+(number|digits|contact)|share\s+your\s+(number|digits|contact|email)|talk\s+(outside|elsewhere)|move\s+(this|the\s+chat)|continue\s+(outside|elsewhere)|off\s+this\s+(app|platform|site))/i

const WORD_TO_DIGIT: Record<string, string> = {
  zero: '0', oh: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
}

export function detectOffPlatformContact(body: string): ChatViolation | null {
  if (!body) return null

  let cleaned = body.toLowerCase()
  // " at " / " dot " obfuscation → @ / .
  cleaned = cleaned.replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.')

  // Email
  if (/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(cleaned)) return 'email'

  // Replace word-form digits before the phone check ("zero eight zero…" → "080…").
  cleaned = cleaned.replace(
    /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,
    (w) => WORD_TO_DIGIT[w] ?? w,
  )

  // Phone: 7+ digits clustered after stripping separators.
  const digits = cleaned.replace(/[\s\-.()+]+/g, '')
  if (/\d{7,}/.test(digits)) return 'phone'

  // Direct URLs / schemes
  if (PLATFORM_URLS.test(body)) return 'platform_url'

  // Standalone platform mention (aggressive)
  if (PLATFORM_NAMES.test(body)) return 'platform_handle'

  // Migration-intent phrases without naming a specific platform
  if (MIGRATION_INTENT.test(body)) return 'platform_intent'

  return null
}

/** Human-readable copy for the warning chip in the composer. */
export function violationLabel(v: ChatViolation): string {
  switch (v) {
    case 'email':           return 'Email addresses aren’t allowed in chat.'
    case 'phone':           return 'Phone numbers aren’t allowed in chat.'
    case 'platform_url':    return 'Sharing other apps isn’t allowed.'
    case 'platform_handle': return 'Mentioning other apps isn’t allowed.'
    case 'platform_intent': return 'Asking to move the chat elsewhere isn’t allowed.'
  }
}
