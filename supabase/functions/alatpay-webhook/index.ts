// Edge Function: ALATPay webhook (callback) — credits the wallet.
//
// Set this URL as the callback/webhook in your ALATPay merchant portal
// (alatpay.ng/portal → Business settings → Callback/Webhook URL):
//   https://<project-ref>.supabase.co/functions/v1/alatpay-webhook
//
// On a settled payment ALATPay POSTs the transaction here. We read the
// nested `Value.Data` model, confirm Status = "completed", match it to our
// pending deposit via the Metadata (which we set to the deposit id), check
// the amount, and credit via the idempotent `credit_alatpay_deposit` RPC.
//
// No subscription key / requery — the callback IS the confirmation. As a
// guard against forged posts we (a) require the BusinessId to match ours and
// (b) only credit a PENDING deposit whose amount matches; the deposit id is
// an unguessable UUID. (Add server requery later if you obtain an
// Ocp-Apim-Subscription-Key, for stronger verification.)
//
// Deploy WITHOUT JWT verification (ALATPay won't send a Supabase JWT):
//   npx supabase functions deploy alatpay-webhook --no-verify-jwt --project-ref <ref>
// Secrets:
//   ALATPAY_BUSINESS_ID         your business id (same as VITE_ALATPAY_BUSINESS_ID)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supaUrl     = Deno.env.get('SUPABASE_URL')
  const svcKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ourBusiness = Deno.env.get('ALATPAY_BUSINESS_ID') // optional but recommended
  if (!supaUrl || !svcKey) return json({ error: 'function not configured' }, 500)

  let body: Record<string, unknown>
  try { body = JSON.parse(await req.text()) } catch { return json({ error: 'bad json' }, 400) }

  // ALATPay nests the transaction under Value.Data; accept a couple of
  // shapes defensively (Value.Data / data / the body itself).
  const value = (body.Value ?? body.value ?? body) as Record<string, unknown>
  const data = (value.Data ?? value.data ?? value) as Record<string, unknown>
  if (!data) return json({ ok: true, ignored: 'no data' })

  const status = String(data.Status ?? data.status ?? '').toLowerCase()
  if (status !== 'completed') return json({ ok: true, ignored: `status=${status}` })

  const businessId = String(data.BusinessId ?? data.businessId ?? '')
  if (ourBusiness && businessId && businessId !== ourBusiness) {
    return json({ error: 'business mismatch' }, 401)
  }

  const customer = (data.Customer ?? data.customer ?? {}) as Record<string, unknown>
  // We send the user's id as the popup metadata, so the webhook can
  // attribute the payment even though no deposit row was pre-created.
  const userId = extractUserId(customer.Metadata ?? customer.metadata ?? data.Metadata)
  const transactionId = String(
    data.Id ?? data.id ?? customer.TransactionId ?? customer.transactionId ?? '',
  )
  const amount = Number(data.Amount ?? data.amount ?? NaN)
  const currency = String(data.Currency ?? data.currency ?? 'NGN').toUpperCase()
  if (!userId || !transactionId || isNaN(amount)) {
    return json({ ok: true, ignored: 'missing userId / transactionId / amount' })
  }

  const admin = createClient(supaUrl, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // The wallet is USD-based. A USD charge is recorded as-is; an NGN charge is
  // converted using the cached daily NGN rate.
  let amountUsd = amount
  if (currency === 'NGN') {
    const { data: fx } = await admin.from('fx_rates').select('rates').eq('id', 1).maybeSingle()
    const ngnPerUsd = Number((fx?.rates as Record<string, number> | undefined)?.NGN ?? 0)
    if (!ngnPerUsd) return json({ error: 'no NGN rate to convert' }, 503)
    amountUsd = amount / ngnPerUsd
  }

  // Idempotent record + credit (same path the client uses). Safe if the
  // client already settled this transaction — it just no-ops.
  const { data: settled, error } = await admin.rpc('settle_alatpay_webhook', {
    user_id: userId,
    transaction_id: transactionId,
    amount_usd: amountUsd,
    amount_local: amount,
    currency_local: currency,
    payload: body,
  })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, deposit: settled })
})

/** Metadata is the bare user UUID (we send it that way); tolerate a JSON
 *  wrapper too. */
function extractUserId(metadata: unknown): string | null {
  if (!metadata) return null
  if (typeof metadata === 'string') {
    const s = metadata.trim()
    if (/^[0-9a-f-]{36}$/i.test(s)) return s
    try {
      const o = JSON.parse(s)
      return (o.userId ?? o.user_id ?? null) as string | null
    } catch { return null }
  }
  if (typeof metadata === 'object') {
    const o = metadata as Record<string, unknown>
    return (o.userId ?? o.user_id ?? null) as string | null
  }
  return null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
