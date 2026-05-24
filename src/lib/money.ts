// Display helpers for the wallet currency. The platform wallet is Naira
// (NGN) — see [[payments-plan]]. The ledger/wallet numeric columns are still
// named *_usdt internally (phase 1) but hold NGN.

/** Format a Naira amount: "₦12,000" (up to 2 decimals when fractional). */
export function formatNgn(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return '₦' + v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
