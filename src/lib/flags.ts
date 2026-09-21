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

/** Normalized 2-letter uppercase code, or null if the input isn't one. */
export function countryCode2(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  const upper = countryCode.toUpperCase()
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

/**
 * Flag as an IMAGE url rather than an emoji. Needed anywhere the flag has to
 * actually look like a flag on Windows/desktop, where Segoe UI Emoji renders
 * regional-indicator pairs as bare letters ("NG" instead of 🇳🇬) — which is
 * exactly what shows up on the feed cards.
 *
 * Served by flagcdn.com (free, no key, no attribution requirement). `width`
 * is one of their supported raster widths; 40 is plenty for a ~20px flag at
 * 2x DPI. Callers should render it with the country code as `alt` so a
 * blocked/failed request still communicates the country.
 */
export function flagImageUrl(
  countryCode: string | null | undefined,
  width: 20 | 40 | 80 = 40,
): string | null {
  const code = countryCode2(countryCode)
  return code ? `https://flagcdn.com/w${width}/${code.toLowerCase()}.png` : null
}
