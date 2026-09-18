/**
 * USD-only amount formatting.
 *
 * Replaces the old currency-conversion pair of hooks, which converted USD into
 * the viewer's local currency via a rates Edge Function. Both are gone in
 * Phase 0 — nothing in the app converts currencies or quotes a local price any
 * more. This keeps the same shape so the screens that still display an amount
 * compile unchanged; they lose only the local-currency conversion.
 *
 * Phase 3 replaces the remaining call sites with credit balances, at which
 * point this module goes too.
 */

export type DisplayAmount = {
  /** Always 'USD' — there is no per-country display currency. */
  code: string
  /** Kept for call-site compatibility; always false. */
  isNgn: boolean
  /** Always true — nothing needs to load before an amount can be shown. */
  ready: boolean
  /** Always false — there is no rate fetch to wait on. */
  pending: boolean
  /** Format a USD-denominated amount. */
  format: (usd: number) => string
  /** Format an amount already in the base currency. */
  formatLocal: (amount: number) => string
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function useUserCurrency(): DisplayAmount {
  return {
    code: 'USD',
    isNgn: false,
    ready: true,
    pending: false,
    format: formatUsd,
    formatLocal: formatUsd,
  }
}
