-- Notify the referrer when someone they invited joins (i.e. when the new
-- user's referral is successfully attributed at the end of onboarding).
-- Re-defines apply_referral (from 0035) to add the notification — only fires
-- when the referral is actually set (not on repeat calls).

create or replace function public.apply_referral(code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  prefix text;
  ref_id uuid;
  current_ref uuid;
  updated int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select referred_by into current_ref from public.profiles where id = me;
  if current_ref is not null then return; end if;          -- already referred

  prefix := lower(regexp_replace(coalesce(code, ''), '^LM-', '', 'i'));
  if length(prefix) < 6 then return; end if;
  prefix := left(prefix, 6);

  select id into ref_id
    from public.profiles
   where left(id::text, 6) = prefix and id <> me
   limit 1;
  if ref_id is null then return; end if;

  update public.profiles set referred_by = ref_id
   where id = me and referred_by is null;
  get diagnostics updated = row_count;

  -- Tell the referrer their invite converted (actor = the new user, so the
  -- bell shows who joined). Routes to the Affiliate screen.
  if updated > 0 then
    insert into public.notifications (user_id, actor_id, type, body)
         values (ref_id, me, 'referral_joined',
                 'Someone you invited just joined Love meet 🎉 You''ll earn 5% of their subscriptions for life.');
  end if;
end $$;

grant execute on function public.apply_referral(text) to authenticated;
