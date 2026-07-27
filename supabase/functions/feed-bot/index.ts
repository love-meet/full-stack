// Edge Function: synthetic accounts that post + comment on the feed so it
// feels alive from day one, without waiting on real user volume.
//
// Content policy — do not relax without checking with product first:
//   - Bot avatars are left `null`. The client already falls back to a
//     generic gendered placeholder (/female.jpg, /male.jpg,
//     /default-profile.jpg — see src/lib/avatar.ts) for ANY user with no
//     photo, real or bot. We never assign a bot a photo of a real person.
//   - Bot POSTS only ever use the IMAGE_POOL below — every entry was
//     downloaded and visually checked to contain no identifiable people
//     before being added (nature, travel, pets, food, hobbies only). Never
//     add an image here without doing the same check: a bot post that
//     reads as "here's a photo of me" is a real impersonation/catfishing
//     risk on a dating app, not just a cosmetic issue.
//
// Two things happen on every invocation (see `action` below):
//   - action: 'seed'  → idempotently create the bot roster (run once).
//   - default (no action, or any other body) → one "tick": a handful of
//     bots comment on recent real posts, and a handful of bots (whichever
//     haven't posted in a while) create a new post.
//
// Schedule: supabase/migrations/0093_feed_bot.sql (pg_cron + pg_net, every
// 20 minutes).
//
// Deploy:  npx supabase functions deploy feed-bot --project-ref <ref>
// Secrets: npx supabase secrets set FEED_BOT_SECRET=<any long random string>
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }
declare const crypto: { randomUUID(): string }

// =============================================================================
// Bot roster — seeded once via {"action":"seed"}, then reused forever.
// =============================================================================
type Persona = {
  handle: string
  displayName: string
  firstName: string
  lastName: string
  gender: 'female' | 'male' | 'nonbinary'
  dob: string
  countryCode: string
  region: string
  city: string
  interests: string[]
  bio: string
}

const BOT_ROSTER: Persona[] = [
  { handle: 'luna_wanders', displayName: 'Luna', firstName: 'Luna', lastName: 'R.', gender: 'female', dob: '1999-03-14', countryCode: 'NG', region: 'Lagos', city: 'Lagos', interests: ['Travel', 'Photography', 'Coffee'], bio: 'Collecting sunsets and plane tickets.' },
  { handle: 'kofi_travels', displayName: 'Kofi', firstName: 'Kofi', lastName: 'A.', gender: 'male', dob: '1997-07-02', countryCode: 'GH', region: 'Greater Accra', city: 'Accra', interests: ['Travel', 'Hiking', 'Music'], bio: 'Always plotting the next trip.' },
  { handle: 'mia_sunsets', displayName: 'Mia', firstName: 'Mia', lastName: 'T.', gender: 'female', dob: '2000-11-23', countryCode: 'PH', region: 'Metro Manila', city: 'Manila', interests: ['Travel', 'Cooking', 'Dancing'], bio: 'Golden hour enthusiast.' },
  { handle: 'theo_hikes', displayName: 'Theo', firstName: 'Theo', lastName: 'B.', gender: 'male', dob: '1996-01-19', countryCode: 'US', region: 'Colorado', city: 'Denver', interests: ['Hiking', 'Fitness', 'Coffee'], bio: 'Mountains on the weekend, spreadsheets on weekdays.' },
  { handle: 'zara_coffee', displayName: 'Zara', firstName: 'Zara', lastName: 'K.', gender: 'female', dob: '1998-05-30', countryCode: 'GB', region: 'England', city: 'Manchester', interests: ['Coffee', 'Reading', 'Writing'], bio: 'Powered entirely by oat lattes.' },
  { handle: 'leo_gamer', displayName: 'Leo', firstName: 'Leo', lastName: 'M.', gender: 'male', dob: '2001-09-08', countryCode: 'BR', region: 'São Paulo', city: 'São Paulo', interests: ['Gaming', 'Music', 'Movies'], bio: 'Controller in one hand, coffee in the other.' },
  { handle: 'nadia_bloom', displayName: 'Nadia', firstName: 'Nadia', lastName: 'H.', gender: 'female', dob: '1999-12-01', countryCode: 'MY', region: 'Kuala Lumpur', city: 'Kuala Lumpur', interests: ['Photography', 'Yoga', 'Travel'], bio: 'Chasing good light and good tea.' },
  { handle: 'sam_wanderlust', displayName: 'Sam', firstName: 'Sam', lastName: 'O.', gender: 'nonbinary', dob: '2000-04-17', countryCode: 'CA', region: 'Ontario', city: 'Toronto', interests: ['Travel', 'Cycling', 'Photography'], bio: 'On a mission to see every coastline.' },
  { handle: 'priya_reads', displayName: 'Priya', firstName: 'Priya', lastName: 'S.', gender: 'female', dob: '1997-02-25', countryCode: 'IN', region: 'Maharashtra', city: 'Mumbai', interests: ['Reading', 'Writing', 'Coffee'], bio: 'One more chapter, always.' },
  { handle: 'felix_puppies', displayName: 'Felix', firstName: 'Felix', lastName: 'D.', gender: 'male', dob: '1995-10-11', countryCode: 'DE', region: 'Bavaria', city: 'Munich', interests: ['Fitness', 'Cooking', 'Travel'], bio: 'Dog dad, amateur chef.' },
  { handle: 'aria_mountains', displayName: 'Aria', firstName: 'Aria', lastName: 'N.', gender: 'female', dob: '1998-08-19', countryCode: 'TH', region: 'Chiang Mai', city: 'Chiang Mai', interests: ['Hiking', 'Yoga', 'Photography'], bio: 'Happiest above 2,000 meters.' },
  { handle: 'dante_citylights', displayName: 'Dante', firstName: 'Dante', lastName: 'C.', gender: 'male', dob: '1996-06-06', countryCode: 'MX', region: 'CDMX', city: 'Mexico City', interests: ['Music', 'Travel', 'Dancing'], bio: 'City nights, loud music, good company.' },
  { handle: 'noor_teatime', displayName: 'Noor', firstName: 'Noor', lastName: 'F.', gender: 'female', dob: '2001-01-27', countryCode: 'EG', region: 'Cairo', city: 'Cairo', interests: ['Cooking', 'Reading', 'Coffee'], bio: 'Tea before anything important.' },
  { handle: 'jonah_trailmix', displayName: 'Jonah', firstName: 'Jonah', lastName: 'W.', gender: 'male', dob: '1994-12-15', countryCode: 'ZA', region: 'Western Cape', city: 'Cape Town', interests: ['Hiking', 'Fitness', 'Travel'], bio: 'Trail runner, terrible cook.' },
  { handle: 'ivy_petals', displayName: 'Ivy', firstName: 'Ivy', lastName: 'L.', gender: 'female', dob: '2000-03-09', countryCode: 'SG', region: 'Singapore', city: 'Singapore', interests: ['Photography', 'Yoga', 'Reading'], bio: 'Plant mom, always adding one more.' },
  { handle: 'marco_boardgames', displayName: 'Marco', firstName: 'Marco', lastName: 'V.', gender: 'male', dob: '1997-11-05', countryCode: 'IT', region: 'Lombardy', city: 'Milan', interests: ['Gaming', 'Music', 'Cooking'], bio: 'Board game nights are non-negotiable.' },
  { handle: 'sana_seaside', displayName: 'Sana', firstName: 'Sana', lastName: 'Q.', gender: 'female', dob: '1999-06-21', countryCode: 'PK', region: 'Sindh', city: 'Karachi', interests: ['Travel', 'Photography', 'Cooking'], bio: 'Ocean person stuck loving mountains too.' },
  { handle: 'kwame_skyline', displayName: 'Kwame', firstName: 'Kwame', lastName: 'O.', gender: 'male', dob: '1998-09-30', countryCode: 'NG', region: 'Abuja', city: 'Abuja', interests: ['Fitness', 'Music', 'Travel'], bio: 'Early gym sessions, late night playlists.' },
  // Adam gets an AI-generated photo gallery via supabase/functions/gallery-bot —
  // see that function's header for why this one persona is a deliberate
  // exception to the non-human-imagery policy applied to every other bot.
  { handle: 'adam_reeves', displayName: 'Adam', firstName: 'Adam', lastName: 'R.', gender: 'male', dob: '1997-04-18', countryCode: 'US', region: 'California', city: 'Los Angeles', interests: ['Fitness', 'Travel', 'Music'], bio: 'Gym in the morning, good music all day.' },
]

// =============================================================================
// Image pool — every image below was downloaded and visually verified to
// contain no identifiable people. Picsum (picsum.photos) is a stable,
// purpose-built placeholder-image service; IDs are permanent.
// =============================================================================
type Category = 'nature' | 'travel' | 'pet' | 'food' | 'lifestyle' | 'hobby'

const IMAGE_POOL: { id: number; category: Category }[] = [
  { id: 10,  category: 'nature' },
  { id: 20,  category: 'lifestyle' },
  { id: 28,  category: 'nature' },
  { id: 29,  category: 'nature' },
  { id: 30,  category: 'food' },
  { id: 40,  category: 'pet' },
  { id: 76,  category: 'travel' },
  { id: 96,  category: 'hobby' },
  { id: 106, category: 'nature' },
  { id: 110, category: 'nature' },
  { id: 140, category: 'nature' },
  { id: 152, category: 'nature' },
  { id: 160, category: 'lifestyle' },
  { id: 190, category: 'nature' },
  { id: 200, category: 'pet' },
  { id: 211, category: 'travel' },
  { id: 225, category: 'food' },
  { id: 237, category: 'pet' },
  { id: 249, category: 'travel' },
  { id: 260, category: 'nature' },
  { id: 271, category: 'travel' },
]

function imageUrl(id: number): string {
  return `https://picsum.photos/id/${id}/1080/1080`
}

const CAPTIONS: Record<Category, string[]> = {
  nature: [
    'Chasing views like this whenever I get the chance 🌿',
    "Some days the sky just shows off.",
    'Slow mornings, big skies.',
    "Nature's better than any filter.",
    'Needed this kind of quiet today.',
  ],
  travel: [
    'New city, same restlessness for the next one ✈️',
    'Somewhere new always feels like the right call.',
    'Wandering with no real plan today.',
    'Collecting places, not things.',
    "Every trip teaches me something I didn't ask for.",
  ],
  pet: [
    'This one runs the house, I just pay rent 🐾',
    'Zero regrets about this good boy.',
    'My favorite roommate, hands down.',
    'Some days they\'re the only reason I get up early.',
    'Unofficial therapist, on duty 24/7.',
  ],
  food: [
    'Small moments, good cup, better mood ☕',
    'Cooking my way through a long week.',
    'This is basically self-care at this point.',
    'Slow down, drink something warm.',
    'Kitchen therapy hits different.',
  ],
  lifestyle: [
    'Deep in it today, but making progress 💻',
    'Productive chaos, as usual.',
    'Some days are just about getting through the list.',
    'Small wins count too.',
  ],
  hobby: [
    'Game night just hits different 🎮',
    'Unwinding the only way I know how.',
    'Some things never get old.',
  ],
}

// =============================================================================
// Comments left on real users' posts. Keyword pools give a light sense of
// "reading" the caption; everything falls back to the generic pool.
// =============================================================================
const GENERIC_COMMENTS = [
  'This made me smile 😊',
  'Okay this is really nice!',
  'Love this energy.',
  'This is such a good one.',
  'Not gonna lie, this is really cool.',
  'Big fan of this.',
  'This is giving really good vibes.',
  'Honestly this made my scroll better.',
  'Okay I see you 👀',
  'This deserves more attention.',
]

const KEYWORD_COMMENTS: { keywords: string[]; comments: string[] }[] = [
  {
    keywords: ['food', 'cook', 'coffee', 'eat', 'dinner', 'lunch', 'breakfast', 'recipe'],
    comments: [
      "Now I'm hungry, thanks for that 😅",
      'This looks so good.',
      'Okay recipe when?',
      'This is making me want to cook tonight.',
    ],
  },
  {
    keywords: ['trip', 'travel', 'city', 'beach', 'mountain', 'flight', 'vacation'],
    comments: [
      'Adding this to my list 📍',
      'Okay where is this?!',
      'This looks like such a good escape.',
      'Take me with you next time.',
    ],
  },
  {
    keywords: ['gym', 'workout', 'fitness', 'run', 'yoga', 'training'],
    comments: [
      'This is the motivation I needed today 💪',
      'Okay I need to get up and move now.',
      'Respect the consistency.',
      'This is inspiring honestly.',
    ],
  },
  {
    keywords: ['dog', 'cat', 'puppy', 'pet', 'kitten'],
    comments: [
      'Okay this is too cute 🥹',
      'Not the cuteness overload.',
      'I need to meet this one.',
      'This made my day better.',
    ],
  },
  {
    keywords: ['game', 'gaming', 'play'],
    comments: [
      'Okay what are you playing?',
      'Big same energy here.',
      'This is the best kind of night in.',
    ],
  },
]

function pickComment(caption: string | null): string {
  const text = (caption ?? '').toLowerCase()
  for (const group of KEYWORD_COMMENTS) {
    if (group.keywords.some((k) => text.includes(k)) && Math.random() < 0.7) {
      return pick(group.comments)
    }
  }
  return pick(GENERIC_COMMENTS)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// =============================================================================
// Tuning
// =============================================================================
const COMMENT_CHANCE_PER_BOT = 0.35
const MAX_COMMENTS_PER_RUN = 20
const POST_CHANCE_PER_ELIGIBLE_BOT = 0.3
const POST_MIN_GAP_HOURS = 18
const MAX_POSTS_PER_RUN = 6
const CANDIDATE_POST_WINDOW_DAYS = 4
const CANDIDATE_POOL_SIZE = 20

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Fail CLOSED: an unset secret must disable the function, not leave the
    // endpoint open to anyone holding the public anon key.
    const secret = Deno.env.get('FEED_BOT_SECRET')
    if (!secret) return json({ error: 'function not configured (FEED_BOT_SECRET unset)' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supaUrl || !svcKey) return json({ error: 'function not configured' }, 500)

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    let body: { action?: string } = {}
    try { body = await req.json() } catch { /* empty body is fine — default tick */ }

    if (body.action === 'seed') {
      const result = await seedBots(admin)
      return json(result)
    }

    const result = await tick(admin)
    return json(result)
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedBots(admin: any) {
  const created: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const persona of BOT_ROSTER) {
    try {
      const { data: existing } = await admin
        .from('profiles')
        .select('id, is_bot')
        .eq('handle', persona.handle)
        .maybeSingle()
      if (existing?.is_bot) { skipped.push(persona.handle); continue }
      if (existing) {
        // A REAL user claimed this roster handle. Silently skipping here
        // would be indistinguishable from success — and gallery-bot targets
        // by handle, so it must never look like this persona exists.
        errors.push(`${persona.handle}: handle is taken by a real user — persona not created`)
        continue
      }

      const email = `${persona.handle}@lovemeet.bot.invalid`
      const { data: userRes, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: crypto.randomUUID(),
        email_confirm: true,
      })
      if (createErr || !userRes?.user) {
        errors.push(`${persona.handle}: ${createErr?.message ?? 'no user returned'}`)
        continue
      }

      const { error: updateErr } = await admin
        .from('profiles')
        .update({
          is_bot: true,
          bot_kind: 'persona',
          handle: persona.handle,
          display_name: persona.displayName,
          first_name: persona.firstName,
          last_name: persona.lastName,
          gender: persona.gender,
          dob: persona.dob,
          country_code: persona.countryCode,
          region: persona.region,
          city: persona.city,
          interests: persona.interests,
          bio: persona.bio,
          // Deliberately NOT set — see 0096_persona_search_exclusion.sql.
          // Keeps personas out of searchable_profiles and the new-member/
          // match-post notification fan-outs, same reasoning as like-bot.
        })
        .eq('id', userRes.user.id)
      if (updateErr) {
        // Roll back the auth user, or every future seed of this persona
        // dies on "email already registered" with no repair path.
        await admin.auth.admin.deleteUser(userRes.user.id).catch(() => {})
        errors.push(`${persona.handle}: ${updateErr.message}`)
        continue
      }

      created.push(persona.handle)
    } catch (e) {
      errors.push(`${persona.handle}: ${(e as Error).message}`)
    }
  }

  return { ok: true, created, skipped, errors }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tick(admin: any) {
  const { data: bots, error: botsErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_bot', true)
    .eq('bot_kind', 'persona')
  if (botsErr) return { ok: false, error: botsErr.message }
  if (!bots || bots.length === 0) {
    return { ok: true, commented: 0, posted: 0, note: 'no bots seeded yet — call with {"action":"seed"} first' }
  }
  const botIds: string[] = bots.map((b: { id: string }) => b.id)

  // Commenting is disabled for now — replaced by the Adam gallery flow.
  // Re-enable by uncommenting the line below (runComments() itself is
  // untouched, just unreachable).
  // const commented = await runComments(admin, botIds)
  const commented = 0
  const posted = await runPosts(admin, botIds)

  return { ok: true, commented, posted }
}

// Currently unreachable — commenting is disabled, see tick() above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
async function runComments(admin: any, botIds: string[]): Promise<number> {
  const since = new Date(Date.now() - CANDIDATE_POST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates } = await admin
    .from('posts')
    .select('id, caption, profiles!inner(is_bot)')
    .eq('profiles.is_bot', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60)
  if (!candidates || candidates.length === 0) return 0

  const candidatePostIds = candidates.map((c: { id: string }) => c.id)
  const { data: existing } = await admin
    .from('post_comments')
    .select('author_id, post_id')
    .in('author_id', botIds)
    .in('post_id', candidatePostIds)

  const taken = new Set((existing ?? []).map((r: { author_id: string; post_id: string }) => `${r.author_id}:${r.post_id}`))

  let count = 0
  for (const botId of shuffle(botIds)) {
    if (count >= MAX_COMMENTS_PER_RUN) break
    if (Math.random() > COMMENT_CHANCE_PER_BOT) continue

    const pool = candidates
      .slice(0, CANDIDATE_POOL_SIZE)
      .filter((c: { id: string }) => !taken.has(`${botId}:${c.id}`))
    if (pool.length === 0) continue

    const target = pick(pool) as { id: string; caption: string | null }
    const body = pickComment(target.caption)

    const { error } = await admin
      .from('post_comments')
      .insert({ post_id: target.id, author_id: botId, body })
    if (!error) {
      taken.add(`${botId}:${target.id}`)
      count++
    }
  }
  return count
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runPosts(admin: any, botIds: string[]): Promise<number> {
  let count = 0
  for (const botId of shuffle(botIds)) {
    if (count >= MAX_POSTS_PER_RUN) break

    const { data: lastPost } = await admin
      .from('posts')
      .select('created_at, media_url')
      .eq('author_id', botId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const eligible = !lastPost
      || (Date.now() - Date.parse(lastPost.created_at)) >= POST_MIN_GAP_HOURS * 60 * 60 * 1000
    if (!eligible) continue
    if (Math.random() > POST_CHANCE_PER_ELIGIBLE_BOT) continue

    const choices = IMAGE_POOL.filter((img) => imageUrl(img.id) !== lastPost?.media_url)
    const image = pick(choices.length ? choices : IMAGE_POOL)
    const caption = pick(CAPTIONS[image.category])

    const { error } = await admin
      .from('posts')
      .insert({
        author_id: botId,
        kind: 'image',
        media_url: imageUrl(image.id),
        media_aspect: 1,
        caption,
      })
    if (!error) count++
  }
  return count
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
