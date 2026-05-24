-- Launch promo 🎉 — anyone who registers within 3 days of launch gets a free
-- $3 credited to their wallet balance.
--
-- Launch: 2026-05-24. Window closes end of 2026-05-27 (UTC).
--
-- The $3 is credited as an 'adjustment' with ref_table = 'launch_promo'. That
-- deliberately keeps it OUT of the withdrawable-earnings pool (my_withdrawable
-- only counts adjustment credits tied to 'withdrawal_requests'), so it's
-- spending power — gifts, going premium — not cashable to a bank.
--
-- Idempotent: a user is credited at most once (guarded on the ledger row).

-- ---------------------------------------------------------------------------
-- New signups during the window get it automatically.
-- ---------------------------------------------------------------------------
create or replace function public.tg_launch_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if now() <= timestamptz '2026-05-27 23:59:59+00'
     and not exists (
       select 1 from public.ledger_entries
        where user_id = new.id and ref_table = 'launch_promo'
     )
  then
    insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
         values (new.id, 'adjustment', 'credit', 3, 'launch_promo', new.id,
                 'Launch bonus 🎉 — $3 free to celebrate our launch');

    insert into public.notifications (user_id, type, body)
         values (new.id, 'launch_bonus',
                 'Welcome gift unlocked 🎁 We''ve added $3 to your balance to celebrate our launch. '
                 'Send a gift, go premium, or spread the love!');
  end if;
  return new;
end $$;

drop trigger if exists launch_bonus_on_signup on public.profiles;
create trigger launch_bonus_on_signup after insert on public.profiles
  for each row execute function public.tg_launch_bonus();

-- ---------------------------------------------------------------------------
-- Backfill: everyone already registered at launch gets it too (test data was
-- cleared beforehand, so these are real launch users). Skips anyone already
-- credited.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if now() <= timestamptz '2026-05-27 23:59:59+00' then
    for r in select id from public.profiles loop
      if not exists (
        select 1 from public.ledger_entries
         where user_id = r.id and ref_table = 'launch_promo'
      ) then
        insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
             values (r.id, 'adjustment', 'credit', 3, 'launch_promo', r.id,
                     'Launch bonus 🎉 — $3 free to celebrate our launch');

        insert into public.notifications (user_id, type, body)
             values (r.id, 'launch_bonus',
                     'Welcome gift unlocked 🎁 We''ve added $3 to your balance to celebrate our launch. '
                     'Send a gift, go premium, or spread the love!');
      end if;
    end loop;
  end if;
end $$;
