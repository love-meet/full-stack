-- Cross-surface identity linking.
--
-- Problem: a user who signs in on the web with Google and then opens the
-- Telegram Mini App lands as a brand-new auth user (because the Telegram
-- sign-in flow creates one keyed by telegram_user_id). They now have two
-- Love meet accounts for the same human — split wallets, split matches,
-- split posts. Tier 2 fix per the architecture review.
--
-- Flow:
--   1. Web user (signed in) taps "Open in Telegram"
--   2. Web calls request_link_token() → "LINK-XXXXXXXXXXXXXXXX", 5 min ttl
--   3. Web opens t.me/<bot>?startapp=LINK-XXX
--   4. Mini App reads start_param, calls the link-telegram Edge Function
--      with the token + Telegram initData
--   5. Edge Function verifies HMAC, consumes the token, attaches
--      telegram_user_id to the EXISTING auth user + profile, and issues
--      a magic link for that user's email. Mini App navigates to the
--      magic link → signed in as the existing account, not a new one.
--
-- This table only stores short-lived tokens; nothing user-visible lives
-- here. Tokens auto-expire after 5 minutes and are consumed on first use.

create table if not exists public.link_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz
);

create index if not exists link_tokens_user_id_idx on public.link_tokens(user_id);
create index if not exists link_tokens_active_idx
  on public.link_tokens(expires_at) where consumed_at is null;

alter table public.link_tokens enable row level security;

-- Users can read their own tokens (e.g. for debugging in support flow).
-- Nobody writes through the PostgREST API — the RPC below + the Edge
-- Function (service-role) handle every write.
drop policy if exists "link_tokens_select_own" on public.link_tokens;
create policy "link_tokens_select_own" on public.link_tokens
  for select to authenticated using (auth.uid() = user_id);

-- ── request_link_token() ──────────────────────────────────────────────────
-- Called by the web client while the user is signed in. Returns a fresh
-- one-shot token tied to their auth.uid(). The web client embeds it as
-- start_param in the Telegram deep link.
--
-- start_param spec: 1–64 chars, [A-Z a-z 0-9 _ -] only. We use a "LINK-"
-- prefix + 16 hex chars (37 chars total) — guaranteed alphanumeric, safely
-- within the cap.
create or replace function public.request_link_token()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me  uuid := auth.uid();
  tok text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  tok := 'LINK-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 16);

  insert into public.link_tokens (token, user_id) values (tok, me);

  -- Opportunistic cleanup: drop expired un-consumed rows for this user so
  -- the table doesn't grow forever. Bounded — only theirs.
  delete from public.link_tokens
   where user_id = me
     and consumed_at is null
     and expires_at < now() - interval '1 hour';

  return tok;
end $$;
grant execute on function public.request_link_token() to authenticated;
