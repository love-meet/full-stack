// Map a profile country (ISO 3166-1 alpha-2, captured at onboarding) to its
// ISO 4217 currency. Used to show the wallet in the user's local currency.
// Unknown / unmapped countries fall back to NGN (the settlement currency),
// so we never display a misleading conversion.

export const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  // Eurozone
  AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR',
  DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR',
  MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR',
  // Rest of Europe
  CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  RO: 'RON', BG: 'BGN', RS: 'RSD', UA: 'UAH', RU: 'RUB', TR: 'TRY', IS: 'ISK',
  // Africa
  GH: 'GHS', KE: 'KES', ZA: 'ZAR', EG: 'EGP', MA: 'MAD', TN: 'TND', DZ: 'DZD',
  UG: 'UGX', TZ: 'TZS', RW: 'RWF', ET: 'ETB', ZM: 'ZMW', ZW: 'ZWL', BW: 'BWP',
  NA: 'NAD', MU: 'MUR', SN: 'XOF', CI: 'XOF', CM: 'XAF', GA: 'XAF', AO: 'AOA',
  MZ: 'MZN', SD: 'SDG', LY: 'LYD', SL: 'SLE', LR: 'LRD', GM: 'GMD',
  // Middle East
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  LB: 'LBP', IL: 'ILS', IQ: 'IQD', IR: 'IRR', YE: 'YER',
  // Asia
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', CN: 'CNY', JP: 'JPY',
  KR: 'KRW', HK: 'HKD', TW: 'TWD', SG: 'SGD', MY: 'MYR', ID: 'IDR', TH: 'THB',
  VN: 'VND', PH: 'PHP', KH: 'KHR', MM: 'MMK', KZ: 'KZT', UZ: 'UZS', AF: 'AFN',
  // Americas
  MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', VE: 'VES',
  UY: 'UYU', PY: 'PYG', BO: 'BOB', DO: 'DOP', GT: 'GTQ', CR: 'CRC', PA: 'PAB',
  JM: 'JMD', TT: 'TTD', HT: 'HTG',
}

/** Currency code for a country code; NGN when unknown. */
export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'NGN'
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? 'NGN'
}

/** Format an amount already in `currency` using the browser's locale, with
 *  the narrow symbol (₦, $, £…). Falls back to a plain code prefix. */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: currency === 'NGN' ? 2 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}
