-- 0110_send_gift_for_coins.sql
--
-- The paid-gift RPC (HS-LM-v1 §06).
--
-- Separate from 0109 on purpose: 0109 adds 'gift_sent' and 'gift_received' to
-- the coin_kind enum, and Postgres will not let a value added by ALTER TYPE be
-- USED in the same transaction that added it. A migration runner wraps each
-- file in one transaction, so writing the function alongside the enum change
-- fails at runtime — not at parse time, which is worse, because it looks fine
-- until someone sends a gift.
--
-- Both sides move in one statement each, inside one transaction: the sender is
-- debited the catalogue cost, the receiver credited the catalogue value, and
-- the difference is burned. Nothing here trusts a number from the client.
-- ==========================================================================

create or replace function public.send_profile_gift(
  p_profile_id uuid,
  p_gift_id    text,
  p_gift_name  text default null,   -- ignored; kept so old clients don't break
  p_gift_image text default null    -- ignored, same reason
) returns public.profile_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me      uuid := auth.uid();
  g       public.gift_catalogue;
  balance int;
  row     public.profile_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_profile_id = me then raise exception 'you cannot gift yourself'; end if;

  if not exists (select 1 from public.profiles p
                  where p.id = p_profile_id and p.deleted_at is null
                    and coalesce(p.is_bot, false) = false) then
    raise exception 'no such profile';
  end if;

  if exists (select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = p_profile_id)
                 or (ub.blocker_id = p_profile_id and ub.blocked_id = me)) then
    raise exception 'blocked';
  end if;

  -- The price comes from the catalogue, never from the caller.
  select * into g from public.gift_catalogue
   where gift_id = p_gift_id and active;
  if g.gift_id is null then raise exception 'no such gift'; end if;

  -- Lock the sender's row before reading the balance, or two gifts sent at
  -- once can both pass the check and overdraw.
  select coins into balance from public.profiles where id = me for update;
  if coalesce(balance, 0) < g.cost_coins then
    raise exception 'insufficient_coins';
  end if;

  insert into public.profile_gifts
       (sender_id, recipient_id, gift_id, gift_name, gift_image, cost_coins, value_coins)
       values (me, p_profile_id, g.gift_id, g.name, g.image, g.cost_coins, g.value_coins)
    returning * into row;

  perform public.apply_coins(
    me, -g.cost_coins, 'gift_sent'::public.coin_kind,
    'profile_gifts', row.id, g.name);

  -- Always strictly less than the sender paid — gift_catalogue enforces it
  -- with a check constraint, so this cannot drift into a free loop even if
  -- someone edits a row later.
  perform public.apply_coins(
    p_profile_id, g.value_coins, 'gift_received'::public.coin_kind,
    'profile_gifts', row.id, g.name);

  insert into public.notifications (user_id, actor_id, type, body)
       values (p_profile_id, me, 'profile_gift', g.name);

  return row;
end $$;

grant execute on function public.send_profile_gift(uuid, text, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- The post-targeted gift is retired rather than repriced.
--
-- §01 of HS-LM-v1 keeps the old spec's removal of the public post feed, so
-- there is nothing left to gift a post from. Leaving a free, unpriced
-- send_gift(p_post_id, …) in place would be a live hole straight through
-- §06's rule: gift a post, get coins, no cost. It raises instead.
-- -------------------------------------------------------------------------
create or replace function public.send_gift(
  p_post_id    uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text
) returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'gifts are sent to people, not posts — use send_profile_gift';
end $$;
