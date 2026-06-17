-- 0089 — Rework gifts to be free, rewarding coins to the recipient.
--
-- Drops the wallet-debit/escrow path entirely. Senders pay nothing to send
-- a gift. Recipients receive 5 coins when they accept it.

alter table public.post_gifts
  alter column amount_cents drop not null,
  alter column amount_cents set default 0;

-- =========================================================================
-- send_gift — funds check and escrow debit removed.
-- =========================================================================
create or replace function public.send_gift(
  p_post_id    uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text,
  p_amount_cents int default 0
)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  recipient uuid;
  g public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select author_id into recipient from public.posts where id = p_post_id;
  if recipient is null then raise exception 'post not found'; end if;
  if recipient = me then raise exception 'You can''t send a gift to yourself.'; end if;

  -- Insert pending gift. No ledger debit, no balance check.
  insert into public.post_gifts (post_id, sender_id, recipient_id, gift_id, gift_name, gift_image, amount_cents, status)
       values (p_post_id, me, recipient, p_gift_id, p_gift_name, p_gift_image, 0, 'pending')
    returning * into g;

  -- No escrow / ledger entry for the sender.

  return g;
end $$;

grant execute on function public.send_gift(uuid, text, text, text, int) to authenticated;

-- =========================================================================
-- respond_gift — replace fiat credit/refund with a virtual coin reward.
-- =========================================================================
create or replace function public.respond_gift(p_gift_id uuid, p_accept boolean)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.post_gifts where id = p_gift_id for update;
  if g.id is null then raise exception 'gift not found'; end if;
  if g.recipient_id <> me then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'this gift was already %', g.status; end if;

  if p_accept then
    update public.post_gifts set status = 'accepted', responded_at = now() where id = g.id
      returning * into g;
    
    -- Credit the recipient with +5 virtual coins.
    perform public.apply_coins(me, 5, 'gift_received', 'post_gifts', g.id, concat('Received gift: ', g.gift_name));
  else
    update public.post_gifts set status = 'rejected', responded_at = now() where id = g.id
      returning * into g;
    
    -- No refund logic needed anymore because sender didn't pay anything.
  end if;

  return g;
end $$;

grant execute on function public.respond_gift(uuid, boolean) to authenticated;
