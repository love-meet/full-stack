/**
 * Mirror of the server-side _detect_offplatform_contact() function. Lets the
 * composer warn BEFORE sending so users learn what's not allowed without
 * triggering a server rejection. Server is still the source of truth.
 */
export type ChatViolation =
  | 'email' | 'phone' | 'platform_url' | 'platform_handle' | 'platform_intent'

export function detectOffPlatformContact(body: string): ChatViolation | null {
  if (!body) return null

  // Common obfuscations: " at " → "@", " dot " → "."
  const cleaned = body
    .toLowerCase()
    .replace(/\s+at\s+/g, '@')
    .replace(/\s+dot\s+/g, '.')

  // Email
  if (/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(cleaned)) return 'email'

  // Phone: 9+ digits clustered after stripping common separators.
  const digits = body.replace(/[\s\-.()+]+/g, '')
  if (/\d{9,}/.test(digits)) return 'phone'

  // Direct contact URLs / schemes.
  if (
    /(wa\.me\/|api\.whatsapp\.com|t\.me\/|telegram\.me\/|tg:\/\/|signal\.me\/|snapchat\.com\/|sc\.com\/|m\.me\/|fb\.me\/|messenger\.com\/|kakao\.com\/|line\.me\/|wechat\.com\/|skype:|imessage:|viber:|discord\.gg\/|discord\.com\/users\/)/i
      .test(body)
  ) return 'platform_url'

  // "my whatsapp is …" / "my insta handle …"
  if (/\bmy\s+(whatsapp|wa|telegram|tg|insta(gram)?|ig|snap(chat)?|discord|tiktok|tt|number|phone|cell|mobile)\s+(is|number|handle|user|tag|username|id|@|:)/i
      .test(body)) return 'platform_handle'

  // "dm me on insta" / "find me on snap" / etc.
  if (/\b(dm|inbox|message|msg|text|call|reach|find|add|hit|chat|whatsapp|telegram|snap|insta(gram)?|tiktok)\s+me\s+on\s+(whatsapp|wa|telegram|tg|insta(gram)?|ig|snap(chat)?|discord|tiktok|tt|email|gmail|outlook|yahoo|tinder|bumble)/i
      .test(body)) return 'platform_intent'

  return null
}

/** Human-readable copy for the warning chip in the composer. */
export function violationLabel(v: ChatViolation): string {
  switch (v) {
    case 'email':  return 'Email addresses aren’t allowed in chat.'
    case 'phone':  return 'Phone numbers aren’t allowed in chat.'
    case 'platform_url':    return 'Sharing other apps isn’t allowed.'
    case 'platform_handle': return 'Sharing a handle for another app isn’t allowed.'
    case 'platform_intent': return 'Asking to move the chat elsewhere isn’t allowed.'
  }
}
