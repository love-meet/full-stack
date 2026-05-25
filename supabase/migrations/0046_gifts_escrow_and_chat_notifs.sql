-- Fixes a batch of launch bugs around gifts + chat notifications:
--
--  bug1: no notification when someone sends a chat message.
--  bug3: gifts weren't recorded in the wallet ledger (no income/outgoing).
--  bug4: gift accept/decline flow + refund the sender on decline.
--  bug5: the sender must have enough balance to buy the gift.
--
-- Gifts now work as ESCROW:
--   send_gift   → checks balance, debits the sender (gift_sent), creates a
--                 'pending' gift, notifies the recipient.
--   respond_gift→ accept: credits the recipient (gift_received, withdrawable).
--                 decline: refunds the sender (adjustment credit, spendable).
--   Either way the existing tg_notify_gift_response trigger pings the sender.

-- ===========================================================================
-- 0) Notification routing columns: deep-link to a chat or a specific gift.
-- ===========================================================================
alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade,
  add column if not exists gift_id        uuid references public.post_gifts(id)    on delete cascade;

-- Rebuild the actor view to surface the new columns. Drop first — adding
-- columns mid-list isn't allowed by CREATE OR REPLACE VIEW.
drop view if exists public.notifications_with_actor;
create view public.notifications_with_actor as
select
  n.id, n.user_id, n.actor_id, n.type, n.post_id, n.comment_id,
  n.conversation_id, n.gift_id, n.body, n.read_at, n.created_at,
  pr.handle       as actor_handle,
  pr.display_name as actor_display_name,
  pr.avatar_url   as actor_avatar_url
from public.notifications n
left join public.profiles pr on pr.id = n.actor_id
where n.user_id = auth.uid();

grant select on public.notifications_with_actor to authenticated;

-- ===========================================================================
-- bug1) Notify conversation members when a new message arrives.
-- One in-app + push (telegram) notification per message to everyone in the
-- conversation except the sender. Deep-links to the conversation.
-- ===========================================================================
create or replace function public.tg_notify_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  snippet text;
begin
  snippet := coalesce(nullif(trim(new.body), ''),
                      case when new.media_kind is not null then '📎 Attachment'
                           else 'sent you a message' end);

  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
  select cm.user_id, new.sender_id, 'chat_message', new.conversation_id, substring(snippet for 120)
    from public.conversation_members cm
   where cm.conversation_id = new.conversation_id
     and cm.user_id <> new.sender_id;
  return new;
end $$;

drop trigger if exists notify_on_chat_message on public.messages;
create trigger notify_on_chat_message after insert on public.messages
  for each row execute function public.tg_notify_chat_message();

-- ===========================================================================
-- bug3 + bug5) send_gift — funds check + escrow debit + pending gift.
-- The post_gifts INSERT trigger (tg_notify_gift) notifies the recipient; we
-- backfill that notification's gift_id below so it deep-links to the gift.
-- ===========================================================================
create or replace function public.send_gift(
  p_post_id    uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text,
  p_amount_cents int
)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  recipient uuid;
  amount numeric;
  balance numeric;
  g public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid gift amount';
  end if;

  -- Recipient is the post's author.
  select author_id into recipient from public.posts where id = p_post_id;
  if recipient is null then raise exception 'post not found'; end if;
  if recipient = me then raise exception 'You can''t send a gift to yourself.'; end if;

  amount := p_amount_cents / 100.0;

  select coalesce(balance_usdt, 0) into balance from public.wallets where user_id = me;
  if balance is null or balance < amount then
    raise exception 'Insufficient balance — top up your wallet to send this gift.';
  end if;

  insert into public.post_gifts (post_id, sender_id, recipient_id, gift_id, gift_name, gift_image, amount_cents, status)
       values (p_post_id, me, recipient, p_gift_id, p_gift_name, p_gift_image, p_amount_cents, 'pending')
    returning * into g;

  -- Escrow: debit the sender now; the funds are held until the recipient
  -- accepts (kept by them) or declines (refunded).
  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'gift_sent', 'debit', amount, 'post_gifts', g.id,
               concat('Gift sent: ', p_gift_name, ' (pending acceptance)'));

  return g;
end $$;

grant execute on function public.send_gift(uuid, text, text, text, int) to authenticated;

-- The recipient's 'gift' notification must carry the gift_id at INSERT time so
-- the email/telegram webhook (fires on INSERT) can deep-link to the gift detail
-- page where they accept/decline. Override the 0036 gift-notify trigger to set
-- gift_id (and drop post_id, so it routes to the gift, not the post).
create or replace function public.tg_notify_gift()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, gift_id, body)
       values (new.recipient_id, new.sender_id, 'gift', new.id, new.gift_name);
  return new;
end $$;
drop trigger if exists notify_on_gift on public.post_gifts;
create trigger notify_on_gift after insert on public.post_gifts
  for each row execute function public.tg_notify_gift();

-- Sender's accept/decline notifications should deep-link to the gift too.
create or replace function public.tg_notify_gift_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.notifications (user_id, actor_id, type, gift_id, body)
         values (new.sender_id, new.recipient_id, 'gift_accepted', new.id, new.gift_name);
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into public.notifications (user_id, actor_id, type, gift_id, body)
         values (new.sender_id, new.recipient_id, 'gift_rejected', new.id, new.gift_name);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_gift_response on public.post_gifts;
create trigger notify_on_gift_response after update of status on public.post_gifts
  for each row execute function public.tg_notify_gift_response();

-- ===========================================================================
-- bug4) respond_gift — recipient accepts or declines a pending gift.
-- ===========================================================================
create or replace function public.respond_gift(p_gift_id uuid, p_accept boolean)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.post_gifts;
  amount numeric;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.post_gifts where id = p_gift_id for update;
  if g.id is null then raise exception 'gift not found'; end if;
  if g.recipient_id <> me then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'this gift was already %', g.status; end if;

  amount := g.amount_cents / 100.0;

  if p_accept then
    update public.post_gifts set status = 'accepted', responded_at = now() where id = g.id
      returning * into g;
    -- Credit the recipient — this is withdrawable earnings.
    insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
         values (me, 'gift_received', 'credit', amount, 'post_gifts', g.id,
                 concat('Gift received: ', g.gift_name));
  else
    update public.post_gifts set status = 'rejected', responded_at = now() where id = g.id
      returning * into g;
    -- Refund the sender — back to spendable balance (not withdrawable).
    insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
         values (g.sender_id, 'adjustment', 'credit', amount, 'post_gifts', g.id,
                 concat('Refund: ', g.gift_name, ' was declined'));
  end if;

  return g;
end $$;

grant execute on function public.respond_gift(uuid, boolean) to authenticated;

-- ===========================================================================
-- Transactions view: ledger entries + the linked gift's status, so the
-- sender's "Gift sent" row can show pending / accepted / declined.
-- (View runs as owner → must scope to auth.uid() itself.)
-- ===========================================================================
create or replace view public.my_transactions as
select
  le.id, le.user_id, le.kind, le.direction, le.amount_usdt,
  le.ref_table, le.ref_id, le.note, le.created_at,
  pg.status as gift_status
from public.ledger_entries le
left join public.post_gifts pg
  on le.ref_table = 'post_gifts' and le.ref_id = pg.id
where le.user_id = auth.uid();

grant select on public.my_transactions to authenticated;

-- Gifts may only be created via send_gift() now (it does the funds check +
-- escrow debit). Deny direct client inserts that would bypass that.
drop policy if exists "pgifts_insert_own_send" on public.post_gifts;
drop policy if exists "pgifts_no_client_insert" on public.post_gifts;
create policy "pgifts_no_client_insert" on public.post_gifts
  for insert to authenticated with check (false);
