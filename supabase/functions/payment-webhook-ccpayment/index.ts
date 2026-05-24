// Edge Function: CCPayment webhook receiver — template you can adapt for
// Wema / Flutterwave / any other provider. Receives the provider's
// deposit-confirmation callback, verifies the signature, and calls the
// `mark_deposit_paid` RPC so the user's wallet credits and the deposit
// row flips to 'paid'.
//
// Deploy with `supabase functions deploy payment-webhook-ccpayment`.
//
// Configure these as secrets on your Supabase project:
//   - CCPAYMENT_APP_ID         (set by you in the CCPayment dashboard)
//   - CCPAYMENT_APP_SECRET     (used to verify the HMAC signature)
//
// Set the function's webhook URL in the CCPayment dashboard:
//   https://<project>.supabase.co/functions/v1/payment-webhook-ccpayment

// @ts-expect-error — Deno-resolved module path; works at runtime in
// Supabase Edge Functions, not in local TypeScript.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved module path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const appId     = Deno.env.get('CCPAYMENT_APP_ID')
  const appSecret = Deno.env.get('CCPAYMENT_APP_SECRET')
  const supaUrl   = Deno.env.get('SUPABASE_URL')
  const svcKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!appId || !appSecret || !supaUrl || !svcKey) {
    return json({ error: 'function not configured' }, 500)
  }

  // ----- Signature verification -----
  // CCPayment signs the body with HMAC-SHA256 using your AppSecret. The
  // exact header name + canonicalization varies by version; consult the
  // CCPayment "Notification Verification" docs and adjust below.
  const sig = req.headers.get('x-ccpayment-signature') ?? ''
  const ts  = req.headers.get('x-ccpayment-timestamp') ?? ''
  const raw = await req.text()
  const expected = await hmacSha256Hex(appSecret, `${ts}.${raw}`)
  if (!constantTimeEquals(sig, expected)) {
    return json({ error: 'bad signature' }, 401)
  }

  // ----- Payload -----
  let payload: { event?: string; data?: Record<string, unknown> }
  try { payload = JSON.parse(raw) } catch { return json({ error: 'bad json' }, 400) }
  if (payload.event !== 'deposit.completed') {
    return json({ ok: true, ignored: payload.event })
  }
  const refId = payload.data?.reference_id as string | undefined
  const txId  = payload.data?.tx_id as string | undefined
  if (!refId) return json({ error: 'no reference_id' }, 400)

  // ----- Mark the deposit paid -----
  const admin = createClient(supaUrl, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.rpc('mark_deposit_paid', {
    deposit_id: refId,
    ref:        txId ?? null,
    payload:    payload as unknown as object,
  })
  if (error) {
    return json({ error: error.message }, 500)
  }
  return json({ ok: true, deposit: data })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
