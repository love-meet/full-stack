# Setup checklist

This file covers everything you need to wire on your end so the app actually
talks to real services. Steps are grouped by milestone so you can do them as
each ships.

## M1 — auth setup

The M1 code is in. To actually sign in (Telegram or Google) you need to wire
three external services. This is a checklist, in the order to do them.

## 1. Supabase project (5 min)

1. Create a project at https://supabase.com (free tier is fine).
2. Project settings → API. Copy `URL` and `anon public` key.
3. Create `lm-app/.env.local`:
   ```
   VITE_SUPABASE_URL=https://<your-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   # Cloudinary — see "Cloudinary setup" below
   VITE_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
   VITE_CLOUDINARY_UPLOAD_PRESET=<your-unsigned-preset>
   ```
4. Open the Supabase SQL editor, paste the contents of
   [supabase/migrations/0001_profiles.sql](supabase/migrations/0001_profiles.sql),
   and run it. This creates `profiles`, RLS, the auth trigger, and `is_admin()`.

You should now be able to run `npm run dev --prefix lm-app`. Hitting `/feed`
without signing in will bounce you back to `/` (the route guard is working).

## 2. Google OAuth — web sign-in (10 min)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth 2.0 Client ID** (Web application).
2. Authorized redirect URIs:
   ```
   https://<your-ref>.supabase.co/auth/v1/callback
   ```
3. Supabase dashboard → **Authentication → Providers → Google** → enable,
   paste the client ID + secret, save.
4. Reload the app. Clicking **Continue with Google** on `/` now signs you in.
   First sign-in lands you on `/onboarding`; subsequent sign-ins go straight
   to `/feed`.

## 3. Telegram bot — Mini-App sign-in (15 min)

This one only matters once you want to test inside Telegram.

1. Talk to **@BotFather** on Telegram:
   - `/newbot` → name + handle → copy the **bot token**.
   - `/newapp` (or `/myapps`) → pick the bot → set the Mini-App URL.
     - For dev: tunnel `localhost:5173` with `ngrok http 5173` or `cloudflared tunnel`,
       then use the public URL.
     - For prod: your deployed URL (Vercel/Netlify/etc.).
   - `/setmenubutton` → choose the bot → set the URL to open the Mini-App.

2. Install the Supabase CLI if you don't have it:
   ```powershell
   scoop install supabase   # or: brew install supabase/tap/supabase
   ```

3. From the `lm-app/` folder:
   ```powershell
   supabase login
   supabase link --project-ref <your-ref>
   supabase secrets set TELEGRAM_BOT_TOKEN=<bot-token>
   supabase secrets set PUBLIC_SITE_URL=https://<your-tunnel-or-prod-url>
   supabase functions deploy auth-telegram --no-verify-jwt
   ```

   `--no-verify-jwt` is required: the caller has no Supabase session yet
   (that's literally what they're trying to get).

4. Open your bot in Telegram, tap the menu button to launch the Mini-App.
   The app calls `auth-telegram` on first render, verifies the `initData`
   HMAC against your bot token, finds-or-creates an `auth.users` row, and
   navigates the WebView to a magic-link `action_url`. You land back on `/`
   already signed in, and the route guard sends you to `/onboarding`.

## What's wired vs not

| Surface     | Sign-in method                       | Wired? |
| ----------- | ------------------------------------ | ------ |
| Web         | Google OAuth (Supabase provider)     | ✅      |
| Telegram    | initData → `auth-telegram` function  | ✅      |
| Onboarding  | Gender, DOB ≥18, geo (Nominatim), interests, sticky submit | ✅ |
| Route guard | `RequireSession` + `RequireProfile`  | ✅      |
| Apple       | (intentionally not built — iOS is out, see memory)         | —  |

## Known gotchas

- **Nominatim rate limit**: reverse geocode in onboarding hits the free
  OpenStreetMap endpoint, capped at ~1 req/sec. Fine for one-off onboarding,
  not for spammy retries. Replace with a paid provider (BigDataCloud /
  Google Geocoding) if it bottlenecks at scale.
- **Google OAuth redirect needs HTTPS in production** but localhost is fine
  for dev — the Supabase callback handles the bridge.
- **`auth-telegram` Edge Function** uses a workaround: it tries
  `createUser` first and falls back to a `profiles` table lookup by
  `telegram_user_id` on the duplicate-email error. If Supabase ships a
  proper `getUserByEmail` admin endpoint later, swap to that.
- **`role` column on `profiles`** is set to `'user'` by default and **cannot
  be changed by the user** (RLS rejects it). To make someone an admin, run
  this in the SQL editor:
  ```sql
  update public.profiles set role = 'admin' where handle = '<their-handle>';
  ```
  (Admin tab UI ships in M8.)

## M1+ — extended profile fields (run BEFORE testing onboarding)

The onboarding wizard ports the full mobile flow — name, bio, looking-for,
hobbies, age range, privacy toggles — and needs columns that `0001` didn't
include.

1. Paste [supabase/migrations/0003_profile_extensions.sql](supabase/migrations/0003_profile_extensions.sql)
   into the SQL editor and run it. Adds:
   - `first_name`, `last_name`, `bio`
   - `looking_for` (serious / casual / friends, check-constrained)
   - `age_min`, `age_max` (18–100, with `min ≤ max` enforced)
   - `show_online_status`, `show_distance` (booleans, default true)
   - `public.username_available(text)` RPC for the debounced username check

2. After Google sign-in, you land on `/onboarding`. Step through the 5
   slides (Name → Details → About → Preferences → Location). On the last
   step, "Enter Love meet" submits and takes you to `/feed`.

## M1++ — country name column

The Location step in onboarding now displays the full country name
("Nigeria") instead of the ISO code ("NG"). Both are stored — ISO in
`country_code` for filtering, name in `country_name` for display.

1. Paste [supabase/migrations/0005_country_name.sql](supabase/migrations/0005_country_name.sql)
   into the SQL editor and run. Adds `country_name text` to `profiles` plus
   a small index.

## Cloudinary setup (one-time — required for any image/video upload)

All media — avatars AND post media — uploads to Cloudinary, not Supabase
Storage. Supabase still owns DB + auth + realtime; we just store the
returned `secure_url` in the `posts.media_url` / `profiles.avatar_url`
columns.

1. Create a free account at https://cloudinary.com. From the dashboard,
   copy your **Cloud name** (top-left of the dashboard).

2. **Create an unsigned upload preset.** Cloudinary dashboard → Settings
   (⚙) → **Upload** → **Add upload preset**:
   - **Signing Mode**: **Unsigned**
   - **Folder**: leave blank (the app sets it per-upload)
   - **Allowed formats**: `jpg, png, webp, mp4, mov, webm`
   - Optional but recommended:
     - **Eager transformations**: add a `c_fill,w_1080,q_auto,f_auto` row
       so feed images are pre-optimized
     - **Resource type**: Auto
   - Save and copy the **preset name**.

3. Put both values in `lm-app/.env.local`:
   ```
   VITE_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
   VITE_CLOUDINARY_UPLOAD_PRESET=<your-unsigned-preset>
   ```

4. **Restart `npm run dev`** so Vite picks up the new env vars.

Smoke test: open `/post`, pick an image, hit Next, change the filter, hit
Next, write a caption, hit Share. The image should land in your Cloudinary
media library under `lm-app/posts/<your-user-id>/` and appear at the top
of `/feed`.

### Deprecated: Supabase Storage buckets

Earlier instructions had you create `post_media` and `avatars` buckets in
Supabase Storage. **Those are no longer used.** You can leave them in
place or delete them — the app doesn't reference either anymore.

## M3+ — post advanced settings (Hide like count / Off comments / Alt text)

The post composer's Advanced settings now writes three real fields on
`posts`. Run [supabase/migrations/0007_post_settings.sql](supabase/migrations/0007_post_settings.sql)
in the SQL editor. It adds:

- `hide_like_count` (bool, default false)
- `comments_disabled` (bool, default false)
- `alt_text` (text, nullable — used as the image's `alt` attribute)

The migration also rebuilds the `posts_with_counts` view so the feed
query returns the new columns. The Feed honors them: hides the like
count and the comments button accordingly, and applies the alt text.

## M3++ — comment replies, comment likes, gifts

Adds threaded replies on post comments, per-comment likes, and a gift-send
flow (mirrors the old Mongo Comment/Like/Gift models).

1. Paste [supabase/migrations/0008_comments_replies_gifts.sql](supabase/migrations/0008_comments_replies_gifts.sql)
   into the SQL editor and run. It:
   - Adds `parent_id` to `post_comments` for 1-level reply threading.
   - Creates `post_comment_likes` (PK on `(comment_id, user_id)`).
   - Creates `post_gifts` with a `status` lifecycle (`pending` → `accepted`
     / `rejected` / `failed`) mirroring the old Mongo Gift model. The
     sender-debit / recipient-credit will be wired in M7 wallet.
   - Adds `post_comments_with_meta` view (like_count, liked_by_me,
     reply_count, author slice) used by the CommentSheet.
   - Rebuilds `posts_with_counts` to surface `gift_count` and to count
     only **root** comments (not replies) on the feed card.
   - Adds the two new tables to the `supabase_realtime` publication.

2. **Gift catalogue** lives client-side at `src/lib/gifts.ts` — the same
   24 items ported verbatim from `_archive/server/utils/flowers.js`. When
   M7 wallet ships we'll add a `respond_gift(id, action)` RPC for the
   accept/reject flow.

## M3++++ — PostCard ⋯ menu (6 actions per state)

1. Paste [supabase/migrations/0009_post_actions.sql](supabase/migrations/0009_post_actions.sql)
   into the SQL editor and run. It:
   - Adds `profiles.is_verified` (drives the cyan ✓ badge next to handles).
   - Creates `post_bookmarks`, `user_blocks`, `user_mutes`, `post_reports`.
   - Adds RLS so each table is owner-scoped (your bookmarks are yours,
     your blocks are yours, your mutes are yours; reports are visible to
     the reporter and admins).
   - Rebuilds `posts_with_counts` to surface `bookmarked_by_me` and
     `author_is_verified`.

2. **What the 6 buttons do** (each writes to a real table or column):
   - **Own post:** Edit caption · Turn off / on commenting · Hide / show
     like count · Copy link · Share to Telegram · Delete post
   - **Other post:** Save (bookmark) · Copy link · Share to Telegram ·
     Mute @user · Block @user · Report post

3. **Mint a verified badge** on yourself for testing:
   ```sql
   update public.profiles set is_verified = true where handle = '<your-handle>';
   ```

## M3 hotfixes — 0010 + 0011 + 0012

Three small migrations you should run together.

1. **Paste** [supabase/migrations/0010_comment_count_total.sql](supabase/migrations/0010_comment_count_total.sql)
   into the SQL editor and run. Rebuilds `posts_with_counts` so
   `comment_count` totals roots **+** replies (was roots-only). On the
   post card, "2 comments + 7 replies" now shows as `9`.

2. **Paste** [supabase/migrations/0011_posts_update_policy.sql](supabase/migrations/0011_posts_update_policy.sql)
   into the SQL editor and run. Adds the missing RLS UPDATE policy on
   `posts` — without it, editing a caption or toggling
   commenting/like-count visibility silently affected 0 rows and
   PostgREST threw "Cannot coerce the result to a single JSON object".

3. **Paste** [supabase/migrations/0012_comments_update_policy.sql](supabase/migrations/0012_comments_update_policy.sql)
   into the SQL editor and run. Same shape of fix for `post_comments`
   — without it, the new "Edit" action on the comment ⋯ menu would
   silently affect 0 rows and PostgREST would throw "Cannot coerce the
   result to a single JSON object".

## M5 — chat setup

1. Paste [supabase/migrations/0006_chat.sql](supabase/migrations/0006_chat.sql)
   into the SQL editor and run. Creates `conversations`,
   `conversation_members`, `messages`, an after-insert trigger that bumps
   `conversations.last_*`, `start_dm(other_user_id)` RPC (finds existing
   1-on-1 or creates one), `mark_read(conversation_id)` RPC, the
   `my_conversations` view, full RLS (members only), and adds all three
   tables to the realtime publication.

2. **Smoke test:** sign in as two different Google accounts in two
   browsers. From one, open `/chat`, tap the ✎ icon, search the other's
   handle, tap to start. You should land on `/chat/<id>`. Send a message.
   The other browser should see the unread badge appear on `/chat` and the
   message land instantly when they open the conversation.

3. **Push notifications when the recipient is offline** — not in M5 v1.
   The plan is a `notify-message` Edge Function called from a database
   trigger (`pg_net`), which DMs the recipient via the Telegram bot. We'll
   wire it once the Telegram bot is real and has users with
   `telegram_user_id` populated.

## M5 — chat parity with the mobile app (0013)

Run [supabase/migrations/0013_chat_parity.sql](supabase/migrations/0013_chat_parity.sql)
to bring the web chat up to feature parity with `_archive/mobile`:

- **Reply / quote** — `messages.reply_to` (UUID, self-FK) + RLS check that
  pins the parent to the same conversation. Bubble renders a cyan-edged
  quoted preview you can tap to scroll to the original.
- **Edit** — `messages.edited_at` + `edit_message(message_id, new_body)`
  RPC. Author-only. The bubble footer shows an "edited" label.
- **Soft delete** — `messages.deleted_at` + `delete_message(message_id)`
  RPC. Author-only. Body is nulled out and the bubble switches to
  "This message was deleted".
- **Per-message read receipts** — `messages.read_by uuid[]` +
  `mark_messages_read(conversation_id)` RPC. Replaces the old
  `mark_read` RPC. Sent → single ✓; the other user opened the chat →
  double ✓✓.
- **Typing indicator** — pure Supabase Realtime broadcast on a
  `typing-<conversationId>` channel (no DB row).

The existing `tg_update_conv_on_message` trigger now fires on both INSERT
and UPDATE, so the conversation list preview stays in sync after edits
and deletes (`[deleted]` shows in the list when the latest message was
removed).

**Also run** [supabase/migrations/0014_chat_fixes.sql](supabase/migrations/0014_chat_fixes.sql)
right after 0013. It fixes two things:

- **Infinite-recursion RLS bug on `conversation_members`.** The 0006 SELECT
  policy was `user_id = auth.uid() OR exists(select 1 from
  conversation_members where conversation_id = ...)`. Postgres re-applies
  that policy when evaluating the inner SELECT, which becomes a self-loop —
  surfaces as `infinite recursion detected in policy for relation
  "conversation_members"` the first time something needs to read the
  *other* member's row (e.g. the `my_conversations` lateral join after a
  send). Fix: a SECURITY DEFINER helper `is_member_of(conv_id)` that
  bypasses RLS for the membership check; conv/member/message policies are
  rewritten to call it.
- **Empty conversations no longer appear in either user's chat list.**
  `my_conversations` now filters on `c.last_message_at IS NOT NULL`, so
  `start_dm` creating the row up front (which it must, so the message
  insert + RLS work) does NOT make a ghost conversation show up before
  anyone has sent anything. As soon as the first message lands, both
  sides' lists pick it up via the existing realtime invalidation.

The same migration also adds `m.deleted_at IS NULL` to the unread-count
lateral join so soft-deleted messages don't keep a thread looking unread.

**Then run** [supabase/migrations/0015_chat_trigger_fix.sql](supabase/migrations/0015_chat_trigger_fix.sql).
This is the partner fix for 0014: the AFTER-INSERT trigger on `messages`
that bumps `conversations.last_message_at` was running as `SECURITY
INVOKER` (i.e. as the `authenticated` user). `authenticated` has no
UPDATE policy on `public.conversations`, so RLS silently denied the
trigger's denormalization write. Before 0014 this didn't matter because
the chat list returned every conversation regardless of
`last_message_at`; with 0014's filter, a sent message would land in
`messages` but `last_message_at` would stay null and the conversation
would disappear from the list. 0015 promotes the trigger to
`SECURITY DEFINER` (owned by `postgres`, which bypasses RLS for the
internal write) and backfills any conversations whose `last_*` columns
the broken trigger had skipped.

**Smoke test:** open the same conversation in two browsers.
   - Send a message → expect ✓ on the sender side, "typing…" pip on the
     recipient side while typing.
   - Recipient opens the conversation → sender's ✓ becomes ✓✓ within ~1s.
   - Long-press (or right-click) a bubble → action sheet with Reply,
     Copy, plus Edit + Delete on your own bubbles.
   - Replying renders a cyan-bordered preview both in the composer
     before send and inside the new bubble; tapping the preview scrolls
     to the original.
   - Editing flips the bubble body in place; "edited" label appears in
     the footer on both sides.
   - Deleting flips the bubble to italic "This message was deleted" with
     a ⊘ glyph on both sides.

## Chunk B — wallet, security, close account (0016)

Run [supabase/migrations/0016_wallet_security.sql](supabase/migrations/0016_wallet_security.sql).
It adds:

- **`wallets`** — one row per user, cached `balance_usdt`. Recomputed by a
  trigger when ledger rows land.
- **`ledger_entries`** — append-only log of every credit/debit in USDT
  (gift_sent/received, tip_sent/received, referral_bonus, deposit,
  withdrawal, adjustment). `ref_table` + `ref_id` link back to the
  domain row that produced the entry.
- **`account_pins`** — bcrypt-hashed 4–6 digit PIN per user.
- **`set_pin(text)` / `verify_pin(text)` / `has_pin()`** RPCs.
- **`profiles.deleted_at`** column — set by the close-account Edge
  Function before the auth row is admin-deleted.
- RLS so users only see their own wallet + ledger; direct client INSERTs
  on the ledger are denied (must flow through SECURITY DEFINER domain
  functions like `send_gift`).

**Deploy the close-account Edge Function:**
```
supabase functions deploy delete-account
```
Source: [supabase/functions/delete-account/index.ts](supabase/functions/delete-account/index.ts).
It verifies the caller's JWT, stamps `profiles.deleted_at`, then calls
`auth.admin.deleteUser(userId)` with the service-role client — cascades
through every FK so messages, posts, ledger, etc. all go with the
account.

Hooks: `useWallet`, `useLedger`, `useWalletRealtime`, `useHasPin`,
`useSetPin`, `useVerifyPin`, `useUpdatePassword`, `useCloseAccount`.
Screens at `/wallet`, `/earnings`, `/security`, `/close-account`, all
linked from the profile ⋮ menu.

**Smoke test:**
- Open Settings → Wallet. Balance reads `0.000000 USDT`. Open Settings →
  My earnings. Same.
- Open Settings → Security. Set a PIN (4–6 digits). Submit. Refresh —
  the section now says "You already have a PIN set."
- Type a new password (≥8 chars), submit. Sign out, sign back in with
  the new password.
- Open Settings → Close account. Type `DELETE` in the field, click the
  red button, confirm. After ~1s you should land back on the landing
  page, and signing in with the same provider will create a fresh
  profile (the old row was hard-deleted).

## Chunk C — WebRTC voice + video calls (0017)

Run [supabase/migrations/0017_calls.sql](supabase/migrations/0017_calls.sql).
Schema only — SDP offers/answers and ICE candidates fly over a
`call-<callId>` Supabase Realtime broadcast channel, not DB rows. The
table just models the state machine:

- **`calls`** table — `caller_id`, `callee_id`, `kind` (voice|video),
  `status` (ringing → active → ended/missed/declined), `end_reason`,
  timestamps. RLS so only the two parties can see the row.
- **`place_call(callee, kind, conv_id)`** — inserts a ringing row, also
  auto-expires any prior abandoned rings from the caller.
- **`accept_call(id)` / `decline_call(id)` / `end_call(id, reason)`** —
  state transitions, all SECURITY DEFINER.
- Calls are on the realtime publication so the callee sees the ring
  within ~100ms without polling.

App code:
- **`useCalls`** — `useIncomingCall()` subscribes to my ringing rows and
  drives the global `<IncomingCallModal/>`; `useCall(id)` watches one
  row; `usePlaceCall`/`useAcceptCall`/`useDeclineCall`/`useEndCall`
  wrap the RPCs.
- **`useCallSignaling`** — the WebRTC peer-connection lifecycle. STUN
  is on by default (`stun:stun.l.google.com:19302`); for cellular NAT,
  add a TURN server via three env vars in `.env.local`:
  ```
  VITE_TURN_URL=turns:your-turn.example:5349
  VITE_TURN_USERNAME=user
  VITE_TURN_CREDENTIAL=pass
  ```
  Without TURN, calls between two users on strict NAT (some carriers)
  will fail with `"Couldn't establish a connection"`. Cloudflare offers
  a free TURN endpoint if you don't want to run coturn yourself.
- **`<IncomingCallModal/>`** — mounted inside `<RequireProfile/>` so it
  fires anywhere in the authenticated app. Plays a synthesized ringtone
  via Web Audio (no asset).
- **`<InCallScreen/>`** at `/call/:callId` — full-screen UI with the
  remote video (or blurred-avatar backdrop for voice / pre-connect),
  local picture-in-picture, mic toggle, camera toggle, hang up.
- **`<CallButtons/>`** — added to the chat detail header (replaces the
  old "view" link). One tap = place_call, navigate to `/call/<id>`,
  caller side drives the SDP offer.

**Smoke test (two browsers, two users):**
- Open the same conversation. From browser A, tap the ☎ icon. Browser B
  should ring within a second with a full-screen modal showing your
  avatar + Accept/Decline buttons.
- Accept on B → both browsers navigate to `/call/<id>`. Allow
  mic/camera permissions when prompted. A voice call connects without
  asking for the camera.
- Toggle mic / camera on either side; the other side's video should
  pause/resume. Hang up from either side → both sides leave.
- Decline instead of accept → caller sees "Couldn't connect" briefly
  then is bounced back; the row is `status=declined`.

## M6 — Search tab (0018)

Run [supabase/migrations/0018_search.sql](supabase/migrations/0018_search.sql).
It does three things:

- **Enables `pg_trgm`** and creates GIN trigram indexes on
  `profiles.handle`, `display_name`, `bio`, and `country_name`, so
  ILIKE `%word%` is fast.
- **Creates the `searchable_profiles` view** — exposes the columns the
  search UI needs plus a computed `age` from `dob`, and pre-filters out:
  - my own row,
  - soft-deleted accounts (`deleted_at IS NOT NULL`),
  - accounts that haven't finished onboarding,
  - both directions of any `user_blocks` row involving me.
- Grants `SELECT` on the view to `authenticated` (it inherits the
  existing `profiles_select_authenticated` RLS from the underlying
  table).

App code:
- **`useSearchProfiles(filters)`** in
  [src/hooks/useSearchProfiles.ts](lm-app/src/hooks/useSearchProfiles.ts) —
  `useInfiniteQuery` with cursor on `created_at`, page size 20.
  Free-text fires three ILIKEs combined with `.or()`; structured
  filters use `.eq()` / `.gte()` / `.lte()`. The free-text and country
  values are sanitised before being inlined into the `or()` string so
  user-typed punctuation can't break the PostgREST query syntax.
- **`SearchScreen`** at `/search` — debounced (250ms) text input,
  quick toggles for "Online now" + four age presets, full chip rows
  for gender + looking-for, free-text country filter. Results are a
  2/3-column grid of profile cards with online dot + verified badge
  + age + city/country line. Tap a card → `/profile/:userId`.
  "Online now" is filtered client-side from the presence store, so it
  reacts instantly without a DB query.

**Smoke test:**
- Open `/search`. With no filters you should see a "Use the filters
  above" empty state.
- Type a partial handle of another user → results narrow as you type.
- Tap a gender chip → results narrow. Tap it again → cleared.
- Tap "Online now" → only currently-online users remain in the grid.
- Scroll to the bottom → "Show more" pagination button works.
- Tap a card → navigates to that user's profile.

## M7 — payments + withdraw + subscriptions (0019)

Run [supabase/migrations/0019_payments.sql](supabase/migrations/0019_payments.sql).
It adds:

- **`subscription_plans`** — 3 seeded SKUs (Lite 30d, Pro 90d, Premium
  365d) priced in USDT.
- **`user_subscriptions`** — current + past subs per user. A partial
  unique index enforces one active sub per user.
- **`deposits`** — every "put money in" event, with `provider` (wema /
  flutterwave / ccpayment / manual), `status` (pending → paid / failed
  / cancelled), the local-currency amount, and the webhook payload.
- **`withdrawal_requests`** — TRC-20 USDT payouts. `status` (pending →
  approved → sent, or rejected).
- **RPCs** — `create_deposit`, `mark_deposit_paid` (admin/webhook),
  `request_withdrawal`, `approve_withdrawal`, `mark_withdrawal_sent`,
  `reject_withdrawal`, `subscribe`. All SECURITY DEFINER; all admin
  paths gate on `role IN ('admin','super_admin')`.

The ledger plumbing is end-to-end: `mark_deposit_paid` writes a
`ledger_entries` credit; `request_withdrawal` writes a debit (locking
the balance); `reject_withdrawal` writes the refund credit;
`subscribe` writes a debit. The 0016 wallet trigger picks all four up
and bumps `wallets.balance_usdt` instantly.

**Out of the box, deposits and withdrawals work in admin-manual-approval
mode** — i.e. no payment-provider integration is required to start
collecting deposits today. Flow:

1. User opens **Wallet → Add funds**, picks Wema (or any provider),
   enters $20.
2. A pending `deposits` row is created. The user sees bank account
   details + a `LM-<id-prefix>` reference.
3. User transfers ₦30,000 from their bank app.
4. An admin opens **/admin/payouts**, sees the pending deposit,
   verifies in their banking app, clicks **Mark paid**.
5. `mark_deposit_paid` writes a credit entry, the user's
   `wallets.balance_usdt` jumps within ~1s (realtime).

Withdrawals are the mirror:

1. User submits a TRC-20 address + amount. The funds are *locked* in a
   `ledger_entries` debit at request time, so they can't double-spend.
2. Admin approves → sends USDT from the platform wallet manually →
   pastes the TX hash into **Mark sent**.
3. If admin rejects, the matching credit refunds the user's balance.

**Edge Functions (optional, drop-in when you have provider creds):**
- [supabase/functions/payment-webhook-ccpayment/index.ts](supabase/functions/payment-webhook-ccpayment/index.ts)
  — template that verifies the HMAC signature on a CCPayment
  `deposit.completed` webhook and calls `mark_deposit_paid`. Set two
  secrets, then deploy:
  ```
  supabase secrets set CCPAYMENT_APP_ID=<your-app-id>
  supabase secrets set CCPAYMENT_APP_SECRET=<your-app-secret>
  supabase functions deploy payment-webhook-ccpayment
  ```
  Then point CCPayment's notification URL at
  `https://<project>.supabase.co/functions/v1/payment-webhook-ccpayment`.
- Wema and Flutterwave webhook receivers follow the same shape — copy
  the CCPayment file, adapt the signature-verification block and the
  `payload.event` filter, and you have an end-to-end auto-confirm
  pipeline.

## M8 — admin tab (0020)

Run [supabase/migrations/0020_admin.sql](supabase/migrations/0020_admin.sql).
It adds:

- **`is_admin()`** SECURITY DEFINER helper that every RLS policy +
  admin RPC uses to gate access.
- **`admin_actions`** — append-only audit log. Every moderation /
  ban / role / payout action inserts a row.
- **`user_bans`** — separate from `user_blocks` (which is user-to-user
  hiding). `lifted_at IS NULL AND (expires_at IS NULL OR expires_at >
  now())` = currently banned.
- **`admin_dashboard`** view — at-a-glance counts of open reports,
  pending deposits/payouts, active bans, etc.
- **Admin RLS additions** — admins can SELECT all `post_reports`,
  `deposits`, `withdrawal_requests`, `user_bans` rows. Reporters /
  account-owners still see their own as before.
- **RPCs** — `resolve_report` (open → resolved/dismissed),
  `ban_user`, `lift_ban`, `set_role` (super_admin only). All write to
  `admin_actions` automatically.

Front-end: a new `/admin` sub-route gated by `useIsAdmin()`. Navigate
there from the Settings drawer's Admin section (only renders for
admins). Tabs:
- **Dashboard** — six count cards linked to the relevant sub-view.
- **Moderation** — open reports queue with one-click Resolve / Dismiss.
- **Users** — debounced handle/name search, ban (with reason) / lift
  ban / change role buttons. Role changes are super-admin-only.
- **Payouts** — both sides: pending deposits with "Mark paid"; pending
  withdrawals with Approve / Mark sent (prompts for TX hash) / Reject
  (prompts for reason).
- **Transactions** — read-only view of the 100 most recent
  `ledger_entries` across the platform.

**Promoting yourself to admin** the first time (super_admin RPC denies
itself, so do this in the SQL editor with the dashboard's elevated
role):
```sql
update public.profiles set role = 'super_admin' where handle = '<your-handle>';
```
After that, you can promote/demote other users via the Users tab.

**Smoke test:**
- As an admin user, open Settings → Admin console. Dashboard should
  show counts ≥ 0.
- Have a non-admin user report one of their own posts (via PostMore →
  Report). It lands in your Moderation tab. Resolve or dismiss it.
- As a non-admin user, deposit $5 via Wema. As admin, open
  /admin/payouts, click Mark paid → the user's wallet balance bumps
  by 5 USDT within 1s.
- As that same user, withdraw 3 USDT to any TRC-20 address. Their
  balance drops by 3 immediately. As admin, approve → Mark sent with
  any string for the TX hash. Reject path: balance refunds.

## M5 extras — chat media + pinned chats + chat ⋯ menu (0021)

Run [supabase/migrations/0021_chat_media_and_pins.sql](supabase/migrations/0021_chat_media_and_pins.sql).
It does three things:

- **Image + video attachments on chat messages.** Adds `media_url`,
  `media_kind` (`image` | `video`), `media_aspect` to `messages`, and
  relaxes the body check so a message can be media-only (text optional
  as a caption).
- **Pinned conversations.** Adds `pinned_at` to `conversation_members`
  (per-user) and rewrites `my_conversations` so pinned rows always
  sort to the top, then by `last_message_at`. The view also surfaces
  `my_pinned_at` for the UI.
- **Two new RPCs** — `toggle_pin_conversation(conv_id)` and
  `mark_conversation_unread(conv_id)` for the chat ⋯ menu.

App code:
- **`useUploadChatMedia`** — Cloudinary unsigned upload, 8 MB cap for
  images / 40 MB for video, returns `{ url, kind, aspect }`.
- **`useSendMessage`** now takes an optional `media` payload alongside
  `body`. A message can be text only, media only, or both (caption).
- **`<ChatBubble/>`** renders the media block above the body — images
  inline, videos with native controls.
- **Composer attach button (＋)** — opens a file picker for image or
  video, uploads, shows a preview with a "✕" cancel, then lets you tap
  send (with or without a caption).
- **`<ChatOptionsSheet/>`** — the ⋯ menu on the chat detail header
  has six items: **View profile**, **Search in chat**, **Pin / Unpin
  chat**, **Mute / Unmute @handle**, **Mark as unread**, **Block @handle**.
  Search toggles an inline bar above the messages list that filters
  client-side over what's currently cached (paginate up if you need to
  search older history).
- **Chat list** — pinned conversations get a 📌 badge next to the
  handle and float to the top of the list.

**About the calls feature:** the voice/video call entry points are
removed from this turn. The 0017 calls schema is still in the database
(no harm done — empty tables) so re-adding the front-end later is just
restoring the deleted files (`InCallScreen`, `IncomingCallModal`,
`useCalls`, `useCallSignaling`, `ringtone`, the `/call/:callId` route,
the modal mount in `RequireProfile`). If you'd rather drop the table
entirely, write a tiny 0022 migration that does
`drop table public.calls cascade; drop type call_kind, call_status,
call_end_reason;`.

**Smoke test:**
- Tap ＋ in the composer, pick an image. See preview, send. Other
  side sees the image inline in a bubble. Same for a short video.
- Open the chat ⋯ menu. Tap **Pin chat** — close the conv and check
  the chat list: pinned conversation should now be at the top with a
  📌. Re-open and tap **Unpin** to confirm both states.
- Tap **Search in chat** → inline search bar opens at top of
  messages → start typing → list filters live. Close with ✕.
- Tap **Mark as unread** → close the conv → chat list shows the
  unread badge again.
- Tap **Mute** → check that the label flips to "Unmute" on re-open.
- Tap **Block** → confirms → you're redirected back to `/chat`.

## Profile menu page + 3D wallet deck (0022)

Run [supabase/migrations/0022_earnings_summary.sql](supabase/migrations/0022_earnings_summary.sql).
It adds the `my_earnings_summary` view — `lifetime_earnings` +
`earnings_30d`, summing the credit-side ledger entries that count as
earnings (gifts/tips received + referral bonuses). Inherits
`ledger_entries` RLS so each user only sees their own totals.

What changed in the app:

- The profile **⋮** icon no longer opens a bottom sheet — it navigates
  to a full page at **`/profile-menu`** (`ProfileMenuScreen`). The old
  `SettingsMenuSheet` component is deleted.
- Top of that page is a **CSS-3D swipeable card deck**
  ([WalletCardDeck](lm-app/src/components/wallet/WalletCardDeck.tsx)) —
  no avatar, just two cards:
  - **Wallet card** — balance in USDT (2 dp), an eye toggle that hides
    it as `******`, plus the UUID and referral code as tap-to-copy rows.
  - **Earnings card** — lifetime earnings (also hideable) + a
    **Withdraw** button that routes to `/wallet/withdraw`.
  - Swipe / drag horizontally or tap the dots to switch cards. Each card
    tilts toward the pointer (perspective + `preserve-3d`) with a glare
    sweep and layered shadow — fully 3D, zero WebGL, ~0 KB added. All
    text stays real and copyable.
- Menu reorg: **Wallet** item removed (the card replaces it),
  **My earnings** is now **Earnings history** (the card shows the
  figure), and a **Transaction history** item points at the full ledger
  (`/wallet`).
- **Six new working destinations:**
  - **Transaction history** → `/wallet` (full ledger).
  - **Saved posts** → `/saved` — grid of your bookmarked posts (reads
    `post_bookmarks`).
  - **Invite friends** → `/invite` — referral code + invite link, copy
    buttons, native/Telegram share.
  - **Blocked users** → `/blocked` — list with one-tap Unblock.
  - **Muted users** → `/muted` — list with one-tap Unmute.
  - **Help & support** → `/legal/help` — FAQ-style support page.

**Smoke test:**
- Open your profile, tap ⋮ → lands on `/profile-menu` (a page, not a
  sheet). No avatar at the top.
- The wallet card shows your balance as `0.00`. Tap the 👁 → it becomes
  `******`. Tap a UUID/referral row → "copied" toast.
- Swipe the card left → Earnings card with a Withdraw button. Tap it →
  withdraw screen.
- Tap Saved posts (bookmark something first), Blocked users, Muted
  users, Invite friends, Help & support — each opens its own working
  page. Unblock/Unmute remove the row immediately.

## Explore → communities, Phase 1 (0023)

Run [supabase/migrations/0023_groups_v2.sql](supabase/migrations/0023_groups_v2.sql).
This is the **full** groups schema (the UI ships across phases):

- **groups** gain `owner_id`, `welcome_message`, `instructions`,
  `avatar_url`, `cover_url`, `is_default`, `visibility`; the fixed-kind
  check is dropped so user groups can exist. The three seeded rooms are
  flagged `is_default = true` and "Naughty 18+" is renamed
  "Naughty girls".
- **group_members** — `role` (owner/admin/member) × `status`
  (active/pending/removed).
- **group_posts** gain `status` (pending/approved/rejected),
  `media_url`/`media_kind`/`media_aspect`, `approved_by`/`approved_at`,
  `reject_reason`; body is now optional when media is present. Existing
  rows are grandfathered to `approved`.
- **group_post_comments** gain `parent_id` (replies — wired in Phase 2).
- **`is_group_admin(gid)`** — platform admin OR group owner/admin.
- **RPCs:** `create_group`, `join_group`, `leave_group`,
  `remove_group_member`, `set_group_member_role`, `approve_group_post`,
  `reject_group_post` (all SECURITY DEFINER; Phases 2–3 wire their UI).
- **Views rebuilt:** `group_posts_with_counts` is now status-aware
  (everyone sees approved; authors see their own pending/rejected;
  group admins see everything) and carries the media columns;
  `groups_with_meta` adds `member_count`, `post_count`, `my_role`,
  `is_member`.
- group_posts INSERT policy now requires `status = 'pending'` so a
  client can't self-approve; direct UPDATEs are denied (approval flows
  through the RPC).

What's live in **Phase 1** (front-end):
- **Explore** is now a grid of **3D group cards** (CSS perspective +
  tilt + glare, same technique as the wallet card) — tap one to open
  its room. The Naughty card still shows the 🔒 + age gate.
- **`/g/:slug`** — the group screen: header card (avatar, name,
  description, instructions), a dismissible welcome banner, the
  approved-post feed (your own pending posts show a "Pending review"
  badge), a **＋** FAB.
- **Group composer** — text, image, or video. Posts insert as
  `pending` and the composer confirms "Submitted for review."
- Media renders with the same blur-placeholder + spinner as chat.

**Phase 2 (no new migration — uses 0023's RPCs):**
- **Moderation inline in the feed.** Moderators (platform admins on the
  official rooms, or a group's owner/admins) see pending posts in-feed
  with **Approve** / **Reject** buttons (reject prompts for an optional
  reason shown to the author). A "🛡 N posts awaiting review" banner at
  the top toggles a pending-only filter. Approve → the post flips to
  approved and becomes public; reject → marked rejected.
- **Threaded conversation page.** The 💬 button on a group post opens a
  full-screen **thread** at `/g/:slug/p/:postId` (outside the shell, so
  the composer pins to the bottom like chat). The post sits at the top
  as the thread starter; below it the comments render as a **recursive
  tree** — replies nest under their parent with a vertical connector
  line (`border-l`), to arbitrary depth, so long back-and-forth
  conversations stay readable. Reply on any comment ("Replying to @x"),
  delete your own, and the like on the post updates both the feed and
  the thread cache. Uses the `parent_id` column from 0023; feed comment
  counts update optimistically.

**Phase 3 (no new migration — uses 0023's RPCs):**
- **Create a group** from the profile menu (Activity → Create a group →
  `/groups/new`). Form: name, description, welcome message, rules /
  instructions, optional group photo (Cloudinary). On submit you become
  the group **owner** and land in the new room. The group then shows up
  as a card in Explore for everyone.
- **Join / leave.** User-created (non-default) groups show a **Join**
  button in the group header; once joined it becomes **Joined ✓**
  (tap → confirm leave). Owners can't leave (they'd orphan the group).
  The official rooms stay open — no join needed.
- **Manage members.** Owners/admins (and platform admins) get a ⚙ in
  the group header → `/g/:slug/manage`: the member list with
  **Remove** on anyone but the owner, and the owner can **Make admin** /
  **Demote** members. Group admins can approve posts + remove members;
  only the owner can change roles.

**Smoke test:**
- Profile menu → Create a group → fill it in → Create. You land in your
  new group; it appears in Explore as a card.
- From a second account, open that group → tap **Join** → it becomes
  **Joined ✓**. Post something → it's pending. Back on the owner
  account, the ⚙ banner / inline Approve shows it.
- Owner → ⚙ → Manage → Make admin / Remove the second account; removed
  members drop out of the list.

**Smoke test:**
- Open Explore → see three tilting cards. Tap "Pickup lines" → lands on
  `/g/pickup`.
- Tap ＋ → write a post (or attach an image/video) → Submit → see the
  "Submitted for review" screen. Back in the feed your post shows with a
  gold "Pending review" badge (others won't see it yet).
- As a platform admin (or the group's owner/admin), the pending post
  shows inline **Approve / Reject** buttons + a top "awaiting review"
  banner. Approve → it becomes public for everyone; reject → marked
  rejected (the author sees the reason).
- Tap the 💬 button on any post → opens the full-screen thread page
  with the post on top and a pinned composer at the bottom. Add a
  comment; tap Reply on one and your reply nests under it with a
  connector line; reply to a reply and it nests deeper. Delete your
  own. The feed card's count updates.
- Tap the Naughty card → age gate → confirm once → enters; subsequent
  visits skip the gate.

## M4 — explore setup

1. Paste [supabase/migrations/0004_explore.sql](supabase/migrations/0004_explore.sql)
   into the SQL editor and run it. Creates `groups` (pre-seeded with the
   three categories), `group_posts`, `group_post_likes`,
   `group_post_comments`, the `group_posts_with_counts` view, RLS, registers
   the three tables on the realtime publication, and adds
   `profiles.age_18_confirmed` for the Naughty gate.

2. No bucket or dashboard work — text-only.

3. **Smoke test:** open `/explore`, switch tabs (`Pickup lines` ↔ `Naughty 18+`
   ↔ `Advice`). The first tap on `Naughty 18+` should prompt the age-gate
   modal; after confirming once, subsequent visits go straight in (it's
   persisted on your profile row). The **+** FAB opens a glass composer for
   that room. Likes and counts should update live across two browsers
   (realtime).

## M3 — feed setup

1. **Run the feed migration.** Paste
   [supabase/migrations/0002_feed.sql](supabase/migrations/0002_feed.sql) into
   the SQL editor and run it. Creates `posts`, `post_likes`, `post_comments`,
   the `posts_with_counts` view, RLS, and registers the three tables on the
   realtime publication.

2. **Storage** — media uploads go to **Cloudinary**, not Supabase. See the
   "Cloudinary setup" section above. The `post_media` bucket steps that
   used to live here are no longer needed.

3. **Realtime is automatic** — the migration adds the tables to the
   `supabase_realtime` publication. No dashboard toggle required.

4. **Smoke test:** open `/feed`, tap the **+** in the bottom nav, walk
   through Pick → Edit → Compose, hit Share. It should land at the top
   of the feed instantly. From another browser / account, tapping the
   heart on that post should update the like count on the first browser
   within ~1s (realtime).

## Feed activity bot (0093)

Synthetic accounts that post + comment on the feed so it feels alive before
real user volume builds up. Content policy: bot avatars are left blank (same
generic placeholder any real user without a photo gets) and bot posts only
ever use non-human stock imagery (nature/travel/pets/food/hobbies) — see the
comment at the top of `supabase/functions/feed-bot/index.ts` before adding
any new image to the pool.

1. **Run the migration.** Paste
   [supabase/migrations/0093_feed_bot.sql](supabase/migrations/0093_feed_bot.sql)
   into the SQL editor — but **replace `<project-ref>` and `<FEED_BOT_SECRET>`
   in the `net.http_post` call first**. Adds `profiles.is_bot`, an index for
   dedup checks, and (if `pg_cron` + `pg_net` are both enabled) schedules the
   bot to tick every 20 minutes.

2. **Enable `pg_net`.** Dashboard → Database → Extensions → enable `pg_net`
   (alongside `pg_cron`, already enabled for the game auto-sweep in
   0057_game_autosweep.sql).

3. **Deploy the function + set its secret:**
   ```
   npx supabase functions deploy feed-bot --no-verify-jwt --project-ref <ref>
   npx supabase secrets set FEED_BOT_SECRET=<any long random string>
   ```

4. **Seed the bot roster — once.** Call the function manually with
   `{"action":"seed"}` and the `x-webhook-secret` header set to your
   `FEED_BOT_SECRET`, e.g.:
   ```
   curl -X POST https://<project-ref>.supabase.co/functions/v1/feed-bot \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: <FEED_BOT_SECRET>" \
     -d '{"action":"seed"}'
   ```
   Creates ~18 bot accounts (real `auth.users` rows + `profiles.is_bot = true`).
   Idempotent — safe to call again, it skips handles that already exist.

5. **Smoke test:** call the function once more with an empty body (`{}`) and
   confirm the response looks like `{"ok":true,"commented":0,"posted":M}`.
   Check the profile Posts tab of a persona for new bot posts. `commented`
   is always 0 while commenting is paused (see "Paused" note below) — do
   NOT expect bot comments to appear on real posts.

**Fix (0096):** the persona roster was originally seeded with `onboarded_at`
set, which unintentionally made those ~18 accounts show up in Search and
made them eligible for the "new member near you"/"someone you might like
posted" notifications — i.e. discoverable as if they were real potential
matches. Run [supabase/migrations/0096_persona_search_exclusion.sql](supabase/migrations/0096_persona_search_exclusion.sql)
to clear it retroactively (safe — nothing in game-bot/chat-bot's RPCs
depends on `onboarded_at`). New personas seeded after this fix no longer
set it in the first place.

## Live-game + chat bot (0094)

Extends the **same** `is_bot` roster from feed-bot with two more capabilities:
a bot can join a real user's game as a live opponent (Number Duel, Draughts,
Pixel Rush), and a bot can hold up its end of a DM conversation using the
Claude API. Neither needs new client code — a game bot joins through the
existing invite-code flow, and a chat bot is reachable the moment a real user
taps "Message" on a bot's profile (same `start_dm` RPC every DM uses).

Because the game RPCs and the `messages` insert policy check `auth.uid()`,
both functions sign in as the *acting* bot (a real Supabase session), unlike
feed-bot which writes directly with the service-role key. That means every
bot account needs one shared, known password — set once via `game-bot`'s
`{"action":"prepare"}` call, never exposed to end users.

1. **Run the migration.** Paste
   [supabase/migrations/0094_game_chat_bot.sql](supabase/migrations/0094_game_chat_bot.sql)
   into the SQL editor — **replace `<project-ref>` and `<GAME_BOT_SECRET>`
   in the `net.http_post` call first**. Adds a lobby-scan index and schedules
   `game-bot` to tick every minute (matches `sweep_games()`'s own cadence in
   0057_game_autosweep.sql, so the bot never lags behind the AFK-forfeit
   timers).

2. **Deploy both functions + set secrets:**
   ```
   npx supabase functions deploy game-bot --no-verify-jwt --project-ref <ref>
   npx supabase functions deploy chat-bot --no-verify-jwt --project-ref <ref>
   npx supabase secrets set GAME_BOT_SECRET=<any long random string>
   npx supabase secrets set CHAT_BOT_SECRET=<any long random string>
   npx supabase secrets set BOT_ACCOUNT_PASSWORD=<any long random string>
   npx supabase secrets set ANTHROPIC_API_KEY=<your Anthropic API key>
   ```
   `BOT_ACCOUNT_PASSWORD` must be the same value for both functions — it's
   the shared login for every bot account.

3. **Prepare the bot roster — once.** Call `game-bot` with `{"action":"prepare"}`:
   ```
   curl -X POST https://<project-ref>.supabase.co/functions/v1/game-bot \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: <GAME_BOT_SECRET>" \
     -d '{"action":"prepare"}'
   ```
   Sets every `is_bot` account's password to `BOT_ACCOUNT_PASSWORD` and tops
   up any bot under 20 coins (games cost 1 coin to create/join). Idempotent —
   safe to re-run any time (e.g. after seeding new bots via feed-bot).

4. **Wire up the chat webhook.** Dashboard → Database → Webhooks → new
   webhook on `public.messages`, event **INSERT**, HTTP Request to
   `https://<project-ref>.supabase.co/functions/v1/chat-bot`, header
   `x-webhook-secret: <CHAT_BOT_SECRET>`. Same pattern as the existing
   `notify-email` webhook on `public.notifications` (see M5 above).

5. **Smoke test — games:** create a 1v1 game from a real account, don't
   invite anyone, and wait ~1 minute. A bot should join automatically (check
   `/play/<code>` — an opponent appears). Start the match and confirm the
   bot actually takes turns (Number Duel: sets a secret then guesses;
   Draughts: moves a piece within a minute of its turn; Pixel Rush: uploads
   an image on its turn, then "solves" after a several-second delay).

6. **Smoke test — chat:** from a real account, open a bot's profile (e.g.
   one that commented on your feed) and tap Message. Send something. Within
   a few seconds you should see the typing indicator, then an in-character
   reply. Send a follow-up and confirm the reply stays consistent with
   earlier context (it's reading the last 20 messages each time).

## Like bots (0095)

A separate, much larger (up to ~10,000) pool of bot accounts whose only job
is to like real posts — distinct from feed-bot's persona roster
(`profiles.bot_kind`: `'persona'` = posts/comments/games/chat, `'liker'` =
likes only). Likers have no bio, no photo, are never discoverable in search,
never get onboarding/match notifications, and a like from one never
generates a "X liked your post" notification — see the header comment in
`0095_like_bots.sql` for why each of those is deliberate. Likes trickle in
over many 5-minute ticks and most posts settle well under the full bot pool
— nothing is designed to put all 10,000 likes on one post.

1. **Run the migration.** Paste
   [supabase/migrations/0095_like_bots.sql](supabase/migrations/0095_like_bots.sql)
   into the SQL editor — **replace `<project-ref>` and `<LIKE_BOT_SECRET>`
   in the `net.http_post` call first**. Adds `profiles.bot_kind` (backfills
   existing bots to `'persona'`), the `bot_add_likes()` SQL helper (not
   grantable to real users — only reachable via the Edge Function's
   service-role client), and schedules `like-bot` to tick every 5 minutes.

2. **Deploy the function + set its secret:**
   ```
   npx supabase functions deploy like-bot --no-verify-jwt --project-ref <ref>
   npx supabase secrets set LIKE_BOT_SECRET=<any long random string>
   ```

3. **Seed the liker pool — in chunks, up to your target.** Each call only
   creates what's still missing (≤300 per call to stay well inside the
   function's execution time limit), so just call it repeatedly until the
   response says `"done":true`:
   ```
   curl -X POST https://<project-ref>.supabase.co/functions/v1/like-bot \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: <LIKE_BOT_SECRET>" \
     -d '{"action":"seed","target":10000}'
   ```
   At ~300/call that's ~34 calls for the full 10,000 — a small shell loop
   works fine:
   ```
   for i in $(seq 1 40); do
     curl -s -X POST https://<project-ref>.supabase.co/functions/v1/like-bot \
       -H "Content-Type: application/json" -H "x-webhook-secret: <LIKE_BOT_SECRET>" \
       -d '{"action":"seed","target":10000}'
     echo
   done
   ```
   You don't have to seed all 10,000 up front — seed a smaller `target`
   (e.g. 500) to start, and re-run with a higher `target` later to top up.

4. **Smoke test:** call the function once more with an empty body (`{}`)
   and confirm the response looks like `{"ok":true,"liked":N,"postsTouched":M}`.
   Check a recent post's like count over a few ticks (~15–20 minutes) —
   it should climb gradually, a few at a time, not jump all at once. Confirm
   the post author does **not** get a flood of like notifications from it.

**Paused (2026-07-26):** liking (`like-bot`'s tick) and commenting
(`feed-bot`'s `runComments`) are both commented out for now, in favor of the
gallery flow below. Posting to the feed (`feed-bot`'s `runPosts`) is
unaffected. Re-enable either by uncommenting the marked line in each
function's `index.ts` — the underlying logic wasn't touched, just made
unreachable.

## Adam's AI-generated gallery (gallery-bot)

A one-off, deliberate exception to every other bot's non-human-imagery
policy: the persona **Adam** (`adam_reeves`, added to feed-bot's roster) gets
a 5-photo AI-generated gallery via [Replicate](https://replicate.com),
uploaded to Cloudinary like any other media in this app, and saved to
`profiles.gallery_urls` — the same column every real user already fills
during onboarding but that had no display anywhere until now. Real users see
it on the new **Gallery** tab on the profile screen (next to Posts).

Read the header comment in `supabase/functions/gallery-bot/index.ts` before
extending this pattern to any other bot — it's an explicit, flagged policy
reversal, not a default.

1. Get a Replicate API token: create an account at
   [replicate.com](https://replicate.com), then grab a token from
   [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens).
   Image generation is pay-per-use (Flux Schnell is inexpensive per image).

2. **Deploy the function + set secrets:**
   ```
   npx supabase functions deploy gallery-bot --no-verify-jwt --project-ref <ref>
   npx supabase secrets set GALLERY_BOT_SECRET=<any long random string>
   npx supabase secrets set REPLICATE_API_TOKEN=<your Replicate token>
   npx supabase secrets set CLOUDINARY_CLOUD_NAME=<same as VITE_CLOUDINARY_CLOUD_NAME>
   npx supabase secrets set CLOUDINARY_UPLOAD_PRESET=<same as VITE_CLOUDINARY_UPLOAD_PRESET>
   ```

3. **Make sure Adam exists first** — call feed-bot's `{"action":"seed"}` (see
   the Feed activity bot section above) so `adam_reeves` is created before
   generating his gallery.

4. **Generate the gallery** (one-off, not scheduled — call it whenever you
   want to (re)generate Adam's photos):
   ```
   curl -X POST https://<project-ref>.supabase.co/functions/v1/gallery-bot \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: <GALLERY_BOT_SECRET>" \
     -d '{}'
   ```
   Takes a a few tens of seconds (5 image generations). Response looks like
   `{"ok":true,"handle":"adam_reeves","generated":5,"gallery_urls":[...]}`.

5. **Smoke test:** open Adam's profile in the app and check the new Gallery
   tab — should show his 5 generated photos. Re-running the function
   regenerates and replaces all 5.
