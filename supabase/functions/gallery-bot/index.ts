// Edge Function: generates AI photo galleries for bot personas and saves
// them to `profiles.gallery_urls` — the column the discovery feed reads
// (get_gallery_feed, 0097) and the profile Gallery tab renders.
//
// ⚠️ DELIBERATE POLICY EXCEPTION — read before extending the roster.
// Every other bot surface in this app uses ONLY non-human imagery: see
// feed-bot's IMAGE_POOL comment, which spells out that a bot post reading
// as "here's a photo of me" is an impersonation/catfishing risk on a dating
// app. A GALLERY is precisely that statement — it's the "here's what I look
// like" surface — so populating one at all means generating photorealistic
// images of people who do not exist. Product explicitly approved this for
// Adam, then approved a small curated set (the roster below) as a visible
// test before deciding whether to scale it to the full 19-persona roster.
// Do not add personas here without that same explicit sign-off.
//
// Uses Replicate for generation and Cloudinary for hosting (matching this
// app's media convention — see src/lib/cloudinary.ts — rather than relying
// on Replicate's delivery URLs, which aren't long-term storage). Each
// persona reuses one appearance description across all its scenes plus a
// per-persona seed base, for the best consistency diffusion models can give
// — treat it as best-effort, not a guaranteed identical face.
//
// Deploy:  npx supabase functions deploy gallery-bot --no-verify-jwt --project-ref <ref>
// Secrets: npx supabase secrets set GALLERY_BOT_SECRET=<any long random string>
//          npx supabase secrets set REPLICATE_API_TOKEN=<your Replicate API token>
//          npx supabase secrets set CLOUDINARY_CLOUD_NAME=<same as VITE_CLOUDINARY_CLOUD_NAME>
//          npx supabase secrets set CLOUDINARY_UPLOAD_PRESET=<same as VITE_CLOUDINARY_UPLOAD_PRESET>
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)
//
// Usage (all calls need the x-webhook-secret header):
//   {}                        → generate for the next persona still missing a
//                               gallery; returns `remaining` so you can call
//                               again until it hits 0. ONE persona per call
//                               by default because 5 generations already take
//                               tens of seconds and edge functions time out.
//   {"max": 2}                → process up to 2 personas this call.
//   {"handle": "luna_wanders"}→ just that persona.
//   {"force": true}           → regenerate even if a gallery already exists.

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

const REPLICATE_MODEL = 'black-forest-labs/flux-schnell'
const SUFFIX = 'photorealistic, natural lighting, candid smartphone photo style, high quality, shot on iphone'

type GalleryPersona = {
  handle: string
  /** Repeated verbatim in every scene prompt — the consistency anchor. */
  appearance: string
  /** One per gallery slot. Written to match the persona's bio/interests/city
   *  in feed-bot's BOT_ROSTER, so the photos cohere with the profile text. */
  scenes: string[]
  seed: number
}

const GALLERY_ROSTER: GalleryPersona[] = [
  {
    handle: 'adam_reeves',
    appearance: 'a 28-year-old man with short dark brown hair, light stubble, brown eyes, athletic build, warm friendly smile',
    seed: 424242,
    scenes: [
      'smiling casually at the camera, standing outdoors on a city street on a sunny day, wearing a navy blue t-shirt',
      'at the gym after a workout, wearing a gray athletic tank top, gym equipment softly blurred in the background',
      'sitting at an outdoor coffee shop table, wearing a casual button-up shirt, holding a coffee cup, relaxed smile',
      'hiking on a scenic mountain trail, wearing a casual outdoor jacket and backpack, big smile, sunny day',
      'dressed smart-casual for a night out, standing in a softly lit restaurant, warm smile',
    ],
  },
  {
    handle: 'luna_wanders',
    appearance: 'a 26-year-old Nigerian woman with long braided black hair, warm dark brown skin, brown eyes, bright natural smile',
    seed: 515151,
    scenes: [
      'sitting at an outdoor cafe table holding a coffee cup, warm morning light, wearing a light summer top',
      'holding a camera on a lively city street at golden hour, wearing a patterned blouse',
      'standing at a scenic overlook at sunset, light breeze in her braids, relaxed happy expression',
      'at a rooftop gathering in the evening with warm string lights above, laughing',
      'relaxed at home in a bright room full of plants, casual sweater, soft daylight',
    ],
  },
  {
    handle: 'kofi_travels',
    appearance: 'a 28-year-old Ghanaian man with short cropped black hair, dark brown skin, neatly trimmed beard, easy relaxed smile',
    seed: 606060,
    scenes: [
      'smiling on a coastal path with the ocean behind him, sunny day, wearing a white linen shirt',
      'sitting on a wooden bench in a city park with headphones around his neck, casual t-shirt',
      'hiking a green hillside trail wearing a light jacket and backpack, wide smile',
      'browsing a colorful outdoor market stall in warm afternoon light, casual shirt',
      'leaning against a brightly painted wall, relaxed portrait, sunglasses pushed up on his head',
    ],
  },
  {
    handle: 'priya_reads',
    appearance: 'a 28-year-old Indian woman with long wavy black hair, warm brown skin, dark brown eyes, gentle thoughtful smile',
    seed: 717171,
    scenes: [
      'reading a book at a window seat in a cozy cafe, soft afternoon light, wearing a mustard cardigan',
      'writing in a notebook at a small wooden desk under warm lamp light',
      'walking along a seaside promenade in the evening, light scarf, city lights behind her',
      'browsing shelves in a bookshop, smiling at the camera over her shoulder',
      'holding a cup of chai on a balcony in the morning, relaxed, wearing a simple kurta',
    ],
  },
  {
    handle: 'zara_coffee',
    appearance: 'a 27-year-old woman with shoulder-length auburn hair, fair skin with light freckles, green eyes, playful smile',
    seed: 828282,
    scenes: [
      'holding a latte in a busy specialty coffee shop, wearing a cream knit jumper',
      'reading in a park on a bright autumn afternoon, leaves on the ground around her',
      'walking a cobbled city street in a wool coat and scarf, overcast day, smiling',
      'working on a laptop at a cafe window seat, rain on the glass behind her',
      'relaxed portrait in a bright bookshop cafe, smiling directly at the camera',
    ],
  },
]

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
    const cfg = { replicateToken, cloudName, uploadPreset }

    let body: { handle?: string; max?: number; force?: boolean } = {}
    try { body = await req.json() } catch { /* empty body → default batch */ }
    const force = body.force === true
    const max = Math.max(1, Math.min(body.max ?? 1, GALLERY_ROSTER.length))

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const targets = body.handle
      ? GALLERY_ROSTER.filter((p) => p.handle === body.handle)
      : GALLERY_ROSTER
    if (body.handle && targets.length === 0) {
      return json({ ok: false, error: `"${body.handle}" is not in the gallery roster` })
    }

    const results: unknown[] = []
    const pending: string[] = []
    let processed = 0

    for (const persona of targets) {
      const { data: profile, error: profileErr } = await admin
        .from('profiles').select('id, gallery_urls, is_bot').eq('handle', persona.handle).maybeSingle()
      if (profileErr) { results.push({ handle: persona.handle, error: profileErr.message }); continue }
      if (!profile) {
        results.push({ handle: persona.handle, skipped: 'not seeded — run feed-bot {"action":"seed"} first' })
        continue
      }
      // Never write to a real user's profile — a real account may have
      // claimed a roster handle before seeding ran.
      if (!profile.is_bot) {
        results.push({ handle: persona.handle, skipped: 'not a bot — refusing to overwrite a real user' })
        continue
      }
      const existing = ((profile.gallery_urls ?? []) as string[]).filter(Boolean)
      if (existing.length >= persona.scenes.length && !force) {
        results.push({ handle: persona.handle, skipped: 'already has a full gallery (pass force:true to regenerate)' })
        continue
      }
      // One persona per call by default: 5 generations already run tens of
      // seconds, and the whole roster in one invocation would time out.
      if (processed >= max) { pending.push(persona.handle); continue }

      results.push(await generateFor(admin, cfg, persona, profile.id, existing))
      processed++
    }

    return json({ ok: true, processed, remaining: pending.length, pending, results })
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

type Cfg = { replicateToken: string; cloudName: string; uploadPreset: string }

async function generateFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any, cfg: Cfg, persona: GalleryPersona, profileId: string, existing: string[],
) {
  const urls: string[] = []
  const errors: string[] = []

  for (let i = 0; i < persona.scenes.length; i++) {
    try {
      const prompt = `${persona.appearance}, ${persona.scenes[i]}, ${SUFFIX}`
      const replicateUrl = await generateImage(cfg.replicateToken, prompt, persona.seed + i)
      urls.push(await uploadToCloudinary(cfg, replicateUrl, profileId, i))
    } catch (e) {
      errors.push(`image ${i + 1}: ${(e as Error).message}`)
    }
  }

  // Never shrink an existing gallery on partial failure — keeping what's
  // there beats replacing 5 good photos with the 2 that happened to work.
  if (urls.length === 0 || urls.length < existing.length) {
    return {
      handle: persona.handle,
      error: `generated only ${urls.length}/${persona.scenes.length} images (existing gallery has ${existing.length}) — kept the current gallery; re-run to retry`,
      errors,
    }
  }

  const { error: updateErr } = await admin
    .from('profiles').update({ gallery_urls: urls }).eq('id', profileId)
  if (updateErr) return { handle: persona.handle, error: updateErr.message }

  return { handle: persona.handle, generated: urls.length, errors: errors.length ? errors : undefined }
}

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

async function uploadToCloudinary(cfg: Cfg, sourceUrl: string, botId: string, index: number): Promise<string> {
  const fd = new FormData()
  fd.append('file', sourceUrl) // Cloudinary fetches remote URLs server-side.
  fd.append('upload_preset', cfg.uploadPreset)
  fd.append('folder', `lm-app/gallery/${botId}`)
  fd.append('tags', 'gallery,bot-generated')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: fd })
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
