-- Stronger off-platform-contact gate for chat.
--
-- v1 (0078) caught the obvious cases: phone runs, emails, direct
-- WhatsApp/Telegram/etc URLs. People will dodge with "my insta is …", "dm me
-- on snap", or "call me at zero eight zero three one two three". This v2
-- replaces the trigger with a more thorough detector AND records each blocked
-- attempt to chat_violations so we can see patterns of abuse.

-- ── Violations log ──────────────────────────────────────────────────────
create table if not exists public.chat_violations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  violation_type  text not null,  -- 'email' | 'phone' | 'platform_url' | 'platform_handle' | 'platform_intent'
  body_excerpt    text,           -- first 200 chars of the rejected message
  created_at      timestamptz not null default now()
);
create index if not exists chat_violations_user_idx
  on public.chat_violations (user_id, created_at desc);

alter table public.chat_violations enable row level security;
drop policy if exists "chat_violations_self_read" on public.chat_violations;
create policy "chat_violations_self_read" on public.chat_violations
  for select to authenticated using (user_id = auth.uid());
-- No client writes — the trigger writes via SECURITY DEFINER.

-- ── Detector: returns a label (email/phone/…) when the body looks like an
--    off-platform contact attempt, NULL when clean. Used by the trigger AND
--    exposed via SQL for client-side mirroring if desired. ────────────────
create or replace function public._detect_offplatform_contact(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text;
  digits  text;
begin
  if p_body is null or length(p_body) = 0 then return null; end if;

  -- Common obfuscations: " at " → "@", " dot " → "."
  cleaned := lower(p_body);
  cleaned := regexp_replace(cleaned, '\s+(at)\s+', '@', 'g');
  cleaned := regexp_replace(cleaned, '\s+(dot)\s+', '.', 'g');

  -- Email
  if cleaned ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' then
    return 'email';
  end if;

  -- Phone-like — 9+ digits clustered after stripping common separators.
  -- (9 instead of 7 reduces false positives on legitimate numbers like
  -- order ids, postal codes, year ranges.)
  digits := regexp_replace(p_body, '[\s\-\.\(\)\+]+', '', 'g');
  if digits ~ '\m\d{9,}\M' then
    return 'phone';
  end if;

  -- Direct contact URLs / schemes.
  if p_body ~* '(wa\.me/|api\.whatsapp\.com|t\.me/|telegram\.me/|tg://|signal\.me/|snapchat\.com/|sc\.com/|m\.me/|fb\.me/|messenger\.com/|kakao\.com/|line\.me/|wechat\.com/|skype:|imessage:|viber:|discord\.gg/|discord\.com/users/)' then
    return 'platform_url';
  end if;

  -- "my whatsapp is …" / "my insta handle …" / "my snap user …" etc.
  if p_body ~* '\m(my)\s+(whatsapp|wa|telegram|tg|insta(gram)?|ig|snap(chat)?|discord|tiktok|tt|number|phone|cell|mobile)\s+(is|number|handle|user|tag|username|id|@|\:)' then
    return 'platform_handle';
  end if;

  -- "dm me on insta" / "message me on whatsapp" / "find me on snap"
  if p_body ~* '\m(dm|inbox|message|msg|text|call|reach|find|add|hit|chat|whatsapp|telegram|snap|insta(gram)?|tiktok)\s+me\s+on\s+(whatsapp|wa|telegram|tg|insta(gram)?|ig|snap(chat)?|discord|tiktok|tt|email|gmail|outlook|yahoo|tinder|bumble)' then
    return 'platform_intent';
  end if;

  return null;
end $$;

-- ── Replace the trigger with the v2 logic ──────────────────────────────
create or replace function public.tg_filter_chat_offplatform()
returns trigger language plpgsql security definer set search_path = public
as $$
declare hit text;
begin
  hit := public._detect_offplatform_contact(coalesce(new.body, ''));
  if hit is null then return new; end if;

  -- Log the attempt (SECURITY DEFINER bypasses RLS so the row lands).
  insert into public.chat_violations (user_id, conversation_id, violation_type, body_excerpt)
       values (new.sender_id, new.conversation_id, hit, left(coalesce(new.body, ''), 200));

  -- Friendly, specific rejection so the user knows what to change.
  if hit = 'email' then
    raise exception 'Email addresses aren''t allowed in chat — keep conversations on Love meet.';
  elsif hit = 'phone' then
    raise exception 'Phone numbers aren''t allowed in chat — keep conversations on Love meet.';
  elsif hit = 'platform_url' then
    raise exception 'Sharing other apps isn''t allowed — keep conversations on Love meet.';
  elsif hit = 'platform_handle' then
    raise exception 'Sharing a handle for another app isn''t allowed — keep conversations on Love meet.';
  else
    raise exception 'This looks like it''s trying to move the chat off Love meet — please rephrase.';
  end if;
end $$;
-- Trigger itself was created in 0078; the CREATE OR REPLACE above is enough.
