// Edge Function: generates an AI photo gallery for a specific bot persona
// (currently just "Adam", handle `adam_reeves` — seeded by feed-bot) and
// saves the results to `profiles.gallery_urls`, the same column every real
// user fills during onboarding and that now renders on the profile
// screen's new Gallery tab (src/screens/profile/ProfileTabs.tsx).
//
// ⚠️ DELIBERATE POLICY EXCEPTION — read before extending this to more bots.
// Every other bot in this app (feed-bot's other 18 personas, all 10,000
// like-bots) uses ONLY non-human imagery specifically to avoid the
// impersonation/catfishing risk of a synthetic account appearing to be a
// real dateable person (see feed-bot/index.ts's header, and the FTC v.
// Match Group-style concern raised and explicitly accepted by product when
// this function was requested). This function is the one intentional
// reversal of that policy: it generates photorealistic images of a person
// and presents them as Adam's own gallery. Do not silently reuse this
// pattern for other personas without the same explicit sign-off.
//
// Uses Replicate (https://replicate.com) for image generation and
// Cloudinary for permanent hosting (matching this app's existing media
// convention — see src/lib/cloudinary.ts — rather than relying on
// Replicate's own delivery URLs, which aren't meant as long-term storage).
// The same base appearance description + a shared seed is reused across
// all 5 generations for the best achievable visual consistency; diffusion
// models don't guarantee an identical "face" across prompts, so treat this
// as best-effort, not a perfect likeness match.
//
// Deploy:  npx supabase functions deploy gallery-bot --project-ref <ref>
// Secrets: npx supabase secrets set GALLERY_BOT_SECRET=<any long random string>
//          npx supabase secrets set REPLICATE_API_TOKEN=<your Replicate API token>
//          npx supabase secrets set CLOUDINARY_CLOUD_NAME=<same value as VITE_CLOUDINARY_CLOUD_NAME>
//          npx supabase secrets set CLOUDINARY_UPLOAD_PRESET=<same value as VITE_CLOUDINARY_UPLOAD_PRESET>
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

const REPLICATE_MODEL = 'black-forest-labs/flux-schnell'
const DEFAULT_HANDLE = 'adam_reeves'

// Same physical description in every prompt (consistency), a different
// everyday scene per photo (realism — a real gallery isn't 5 identical shots).
const APPEARANCE =
  'a 28-year-old man with short dark brown hair, light stubble, brown eyes, athletic build, warm friendly smile'
const SUFFIX = 'photorealistic, natural lighting, candid smartphone photo style, high quality, shot on iphone'
const SCENES = [
  `${APPEARANCE}, smiling casually at the camera, standing outdoors on a city street on a sunny day, wearing a navy blue t-shirt, ${SUFFIX}`,
  `${APPEARANCE}, taking a mirror selfie at the gym after a workout, wearing a gray athletic tank top, gym in the background, ${SUFFIX}`,
  `${APPEARANCE}, sitting at an outdoor coffee shop table, wearing a casual button-up shirt, holding a coffee cup, relaxed smile, ${SUFFIX}`,
  `${APPEARANCE}, hiking on a scenic mountain trail, wearing a casual outdoor jacket and backpack, big smile, sunny day, ${SUFFIX}`,
  `${APPEARANCE}, dressed smart-casual for a night out, standing in a softly lit restaurant, warm smile, ${SUFFIX}`,
]
const SHARED_SEED = 424242

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Fail CLOSED: this function overwrites profile data via the service
    // role, so an unset secret must disable it, not leave it open.
    const secret = Deno.env.get('GALLERY_BOT_SECRET')
    if (!secret) return json({ error: 'function not configured (GALLERY_BOT_SECRET unset)' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN')
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
    const uploadPreset = Deno.env.get('CLOUDINARY_UPLOAD_PRESET')
    if (!supaUrl || !svcKey || !replicateToken || !cloudName || !uploadPreset) {
      return json({ error: 'function not configured' }, 500)
    }

    let body: { handle?: string } = {}
    try { body = await req.json() } catch { /* use default handle */ }
    const handle = body.handle ?? DEFAULT_HANDLE

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: profile, error: profileErr } = await admin
      .from('profiles').select('id, gallery_urls, is_bot').eq('handle', handle).maybeSingle()
    if (profileErr) return json({ ok: false, error: profileErr.message })
    if (!profile) return json({ ok: false, error: `no profile with handle "${handle}" — seed it via feed-bot first` })
    // Never write to a real user's profile — the handle is caller-supplied,
    // and a real user may even have claimed a roster handle before seeding
    // (feed-bot's seeder reports that as an error rather than adopting them).
    if (!profile.is_bot) {
      return json({ ok: false, error: `profile "${handle}" is not a bot — refusing to overwrite a real user's gallery` })
    }

    const urls: string[] = []
    const errors: string[] = []

    for (let i = 0; i < SCENES.length; i++) {
      try {
        const replicateUrl = await generateImage(replicateToken, SCENES[i], SHARED_SEED + i)
        const cloudinaryUrl = await uploadToCloudinary(cloudName, uploadPreset, replicateUrl, profile.id, i)
        urls.push(cloudinaryUrl)
      } catch (e) {
        errors.push(`image ${i + 1}: ${(e as Error).message}`)
      }
    }

    // Never shrink an existing gallery on partial failure — replacing 5 good
    // photos with the 2 that happened to generate is strictly worse than
    // keeping what's there and letting the operator re-run.
    const existing = (profile.gallery_urls ?? []) as string[]
    if (urls.length === 0 || urls.length < existing.length) {
      return json({
        ok: false,
        error: `generated only ${urls.length}/${SCENES.length} images (existing gallery has ${existing.length}) — keeping the current gallery; re-run to retry`,
        errors,
      })
    }

    const { error: updateErr } = await admin
      .from('profiles').update({ gallery_urls: urls }).eq('id', profile.id)
    if (updateErr) return json({ ok: false, error: updateErr.message })

    return json({ ok: true, handle, generated: urls.length, gallery_urls: urls, errors: errors.length ? errors : undefined })
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

async function generateImage(token: string, prompt: string, seed: number): Promise<string> {
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ input: { prompt, seed } }),
  })
  if (!res.ok) throw new Error(`Replicate request failed (${res.status}): ${(await res.text()).slice(0, 200)}`)

  let prediction = await res.json()

  // Prefer: wait=60 usually resolves synchronously, but poll as a fallback
  // in case generation took longer than the wait window allowed.
  const deadline = Date.now() + 90_000
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
    if (!prediction.id) throw new Error(`unexpected Replicate response: ${JSON.stringify(prediction).slice(0, 200)}`)
    if (Date.now() > deadline) throw new Error('timed out waiting for image generation')
    await sleep(2000)
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!poll.ok) throw new Error(`Replicate poll failed (${poll.status}): ${(await poll.text()).slice(0, 200)}`)
    prediction = await poll.json()
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(`generation ${prediction.status}: ${JSON.stringify(prediction.error ?? '').slice(0, 200)}`)
  }

  const output = prediction.output
  const url = Array.isArray(output) ? output[0] : output
  if (typeof url !== 'string' || !url) throw new Error('no output URL in prediction result')
  return url
}

async function uploadToCloudinary(
  cloudName: string,
  uploadPreset: string,
  sourceUrl: string,
  botId: string,
  index: number,
): Promise<string> {
  const fd = new FormData()
  fd.append('file', sourceUrl) // Cloudinary fetches remote URLs server-side when passed as `file`.
  fd.append('upload_preset', uploadPreset)
  fd.append('folder', `lm-app/gallery/${botId}`)
  fd.append('tags', 'gallery,bot-generated')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const url = data.secure_url
  if (typeof url !== 'string' || !url) throw new Error(`Cloudinary response had no secure_url (image ${index + 1})`)
  return url
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
