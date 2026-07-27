/**
 * ISO 3166-1 alpha-2 country code → flag emoji, built from Unicode regional
 * indicator symbols (no image assets/lookup table needed).
 *
 * Known cosmetic caveat: Windows' default emoji font (Segoe UI Emoji) does
 * not render regional-indicator flag sequences as flags — it shows the two
 * letters instead. The emoji itself is correct; this is a platform font
 * limitation, not a bug (same caveat already noted for the language picker).
 */
export function flagEmoji(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  const upper = countryCode.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return null
  const codePoints = [...upper].map((c) => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
