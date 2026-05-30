-- Re-lock game creation to members + block free→paid DMs + strip
-- off-platform contact attempts from chat.
--
-- 1. create_game gets its has_active_subscription guard back (we lifted it
--    in 0073 to grow usage; now the gate's back in place for VIP/Premium
--    only — free members can still JOIN a game they were invited to).
-- 2. tg_block_free_to_paid_dm: free senders cannot send a 1:1 message to a
--    Premium / VIP recipient. Paid senders can message anyone.
-- 3. tg_filter_chat_offplatform: rejects messages that look like an attempt
--    to move the conversation off Love meet — phone numbers, emails, or
--    direct links to WhatsApp / Telegram / Signal / Snapchat / Messenger
--    / Line / Kakao / WeChat / Skype handles.

-- ── 1. Members-only game creation ───────────────────────────────────────
create or replace function public.create_game(p_kind text, p_max int default 2, p_type text default 'pixel_rush')
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; code text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_active_subscription(me) then
    raise exception 'Games are for Premium and VIP members. Free accounts can still join any game they''re invited to.';
  end if;

  loop
    code := upper(substring(md5(random()::text) for 6));
    exit when not exists (select 1 from public.games where invite_code = code);
  end loop;

  insert into public.games (host_id, kind, game_type, max_players, invite_code, status, rounds_total)
       values (me, p_kind::public.game_kind, p_type::public.game_type,
               case when p_kind = '1v1' then 2 else greatest(2, least(50, p_max)) end,
               code, 'lobby',
               case when p_type = 'number_duel' then 12 else 9 end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;

-- ── 2. Free → Paid DM block ─────────────────────────────────────────────
create or replace function public.tg_block_free_to_paid_dm()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sender_paid boolean; recipient uuid; recipient_paid boolean;
begin
  sender_paid := public.has_active_subscription(new.sender_id);
  if sender_paid then return new; end if;

  -- Find the other participant in the conversation (1:1 DMs only).
  select cm.user_id into recipient
    from public.conversation_members cm
   where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
   limit 1;
  if recipient is null then return new; end if;

  recipient_paid := public.has_active_subscription(recipient);
  if recipient_paid then
    raise exception 'Free accounts can''t message Premium or VIP members. Upgrade to chat with them.';
  end if;
  return new;
end $$;

drop trigger if exists block_free_to_paid_dm on public.messages;
create trigger block_free_to_paid_dm
  before insert on public.messages
  for each row execute function public.tg_block_free_to_paid_dm();

-- ── 3. Off-platform contact filter ──────────────────────────────────────
-- Applies to every message: phone numbers, email addresses, and direct
-- contact-sharing URLs all get rejected. Internal /play/CODE links and
-- normal chat are unaffected.
create or replace function public.tg_filter_chat_offplatform()
returns trigger language plpgsql security definer set search_path = public
as $$
declare body_text text; digits_only text;
begin
  body_text := coalesce(new.body, '');

  -- Phone number — 7+ digits clustered (after stripping common separators).
  digits_only := regexp_replace(body_text, '[\s\-\.\(\)\+]+', '', 'g');
  if digits_only ~ '\m\d{7,}\M' then
    raise exception 'Phone numbers aren''t allowed in chat — keep conversations on Love meet.';
  end if;

  -- Email address.
  if body_text ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' then
    raise exception 'Email addresses aren''t allowed in chat — keep conversations on Love meet.';
  end if;

  -- Direct links to off-platform messaging services.
  if body_text ~* '(wa\.me/|api\.whatsapp\.com|t\.me/|telegram\.me/|tg://|signal\.me/|snapchat\.com/|sc\.com/|m\.me/|fb\.me/|messenger\.com/|kakao\.com/|line\.me/|wechat\.com/|skype:|imessage:|viber:)' then
    raise exception 'Sharing other messaging platforms isn''t allowed — keep conversations on Love meet.';
  end if;

  return new;
end $$;

drop trigger if exists filter_chat_offplatform on public.messages;
create trigger filter_chat_offplatform
  before insert on public.messages
  for each row execute function public.tg_filter_chat_offplatform();
