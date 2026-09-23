-- 0109_gifts_cost_coins.sql
--
-- HS-LM-v1 §06 replaces the gift model.
--
-- A gift must be BOUGHT with coins before it can be sent, and must be worth
-- FEWER coins to the receiver than it cost the sender. That asymmetry is the
-- whole point: it is what stops two accounts gifting each other in a circle
-- and messaging free for ever. The coin supply only ever shrinks on a gift.
--
-- This reverses the 19 Sep ruling that gifts grant the recipient nothing, and
-- 0106, which gave profile_gifts no amount column precisely so a price could
-- not creep back in. §06 is now the truth, so the columns arrive here —
-- explicitly, with the burn recorded, rather than by loosening 0106.
--
-- THE PRICE LIVES IN THE DATABASE, NOT THE CLIENT. The old catalogue was a
-- TypeScript array; if it stayed there, the browser would be telling the
-- server what a gift costs, and anyone could send the most expensive gift for
-- one coin. public.gift_catalogue is the authority and the RPC reads it.
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. The catalogue.
-- -------------------------------------------------------------------------
create table if not exists public.gift_catalogue (
  gift_id      text primary key,
  name         text not null,
  image        text,
  cost_coins   int  not null check (cost_coins > 0),
  value_coins  int  not null check (value_coins >= 0),
  sort_order   int  not null default 100,
  active       boolean not null default true,
  -- §06, enforced by the database rather than by whoever edits the row next:
  -- the receiver must always get less than the sender paid.
  constraint gift_value_below_cost check (value_coins < cost_coins)
);

alter table public.gift_catalogue enable row level security;

drop policy if exists "gift_catalogue_read" on public.gift_catalogue;
create policy "gift_catalogue_read" on public.gift_catalogue
  for select to authenticated using (active);

-- No client writes. Pricing is an admin action.
drop policy if exists "gift_catalogue_no_write" on public.gift_catalogue;
create policy "gift_catalogue_no_write" on public.gift_catalogue
  for insert to authenticated with check (false);

-- Seed from the shipped catalogue. Three tiers, each returning 60% of its
-- cost to the receiver — a real gesture that costs the sender something, and
-- a 40% burn on every send.
insert into public.gift_catalogue (gift_id, name, image, cost_coins, value_coins, sort_order)
values
  ('456720', 'Rose flower in Glass',          'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower_z8xudz.webp',                    50,  30, 10),
  ('456722', 'Red Roses',                     'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707532/flower3_h04yvs.webp',                    50,  30, 11),
  ('456726', 'Classic Flower',                'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707526/flower7_gadpes.webp',                    50,  30, 12),
  ('456723', 'Orchid Flower',                 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707529/flower8_nogxex.webp',                    50,  30, 13),
  ('456725', 'Exotic Flower',                 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower5_pygwjt.webp',                    50,  30, 14),
  ('456721', 'Flower Bouquet',                'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower4_rgdwsx.webp',                   100,  60, 20),
  ('456724', 'Lillies Rose',                  'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707528/flower2_ry31ft.webp',                   100,  60, 21),
  ('456735', 'Love Teddy',                    'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/love_teddy_jvdmyp.jpg',                 100,  60, 22),
  ('456729', 'Attractive teddy',              'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/attractive_teddy_qeiwpq.jpg',           100,  60, 23),
  ('456738', 'A Massage Teddy',               'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/a_massage_teddy_ak47pw.jpg',            100,  60, 24),
  ('456739', 'Wabby Soft Cute Teddy',         'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/wabby_soft_cute_zo1lnz.jpg',            100,  60, 25),
  ('456730', 'Fruit & Yogurt Parfait',        'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/fruit_and_yogurt_parfait_i1krav.jpg',   100,  60, 26),
  ('456733', 'Crystal Parfait',               'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/Crystal_parfait_tqcgvq.jpg',            100,  60, 27),
  ('456734', 'Cinnamon Apple Yogurt Parfait', 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/cinnamon_apple_yogurt_partfait_jmdksj.jpg', 100, 60, 28),
  ('456741', 'One Round',                     'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/one_round_gxcoa1.jpg',                  100,  60, 29),
  ('456737', 'Two Hot Rounds',                'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/two_rounds_l5jmll.jpg',                 100,  60, 30),
  ('456742', 'Soft Two Rounds',               'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/soft_two_rounds_zmw8ol.jpg',            100,  60, 31),
  ('456727', 'Diamond Roses',                 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower6_uchrz7.webp',                   250, 150, 40),
  ('456728', 'Dark Wrist Watch',              'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/dark_watch_dqd0tc.jpg',                 250, 150, 41),
  ('456743', 'Titanum Wrist Watch',           'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/titanum_watch_xhngei.jpg',              250, 150, 42),
  ('456731', 'Peodagar WristWatch',           'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125185/peodagar_615_rje1wi.jpg',               250, 150, 43),
  ('456732', 'Dual Analog WristWatch',        'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/dual_analog_watch_jqvufd.jpg',          250, 150, 44),
  ('456736', 'Ice Wristwatch',                'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/ice_watch_krgwvx.jpg',                  250, 150, 45),
  ('456740', 'Corporate wristwatch',          'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/images_3_taaxsq.jpg',                   250, 150, 46)
on conflict (gift_id) do update
  set name = excluded.name,
      image = excluded.image,
      cost_coins = excluded.cost_coins,
      value_coins = excluded.value_coins,
      sort_order = excluded.sort_order,
      active = true;

-- -------------------------------------------------------------------------
-- 2. profile_gifts records what it cost and what it was worth.
-- -------------------------------------------------------------------------
alter table public.profile_gifts
  add column if not exists cost_coins  int,
  add column if not exists value_coins int;

-- -------------------------------------------------------------------------
-- 3. 'gift_sent' and 'gift_received' as ledger kinds.
--
-- 0096 removed gift_received specifically to close this loophole at the type
-- level. §06 reopens it under a rule that makes it safe — the receiver always
-- gets less than the sender paid — so the kinds come back, both of them, so
-- the burn is visible in the ledger rather than implied.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'coin_kind' and e.enumlabel = 'gift_sent'
  ) then
    alter type public.coin_kind add value 'gift_sent';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'coin_kind' and e.enumlabel = 'gift_received'
  ) then
    alter type public.coin_kind add value 'gift_received';
  end if;
end $$;
