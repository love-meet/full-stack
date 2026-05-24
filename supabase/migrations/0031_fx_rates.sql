-- FX rate cache for displaying the wallet in each user's local currency.
--
-- The wallet is settled in NGN (ALATPay). For display only, we convert NGN
-- amounts to the signed-in user's local currency using daily USD-based rates
-- from ExchangeRate-API. Rates are cached here as a single row and refreshed
-- at most once a day by the `fx-rates` Edge Function (which holds the API
-- key) — the browser never sees the key and we stay well within the free
-- request quota.

create table if not exists public.fx_rates (
  id         smallint primary key default 1 check (id = 1),
  base       text not null default 'USD',
  rates      jsonb not null,             -- { "USD":1, "NGN":1371.09, "GBP":0.74, ... }
  fetched_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

-- Anyone signed in can read the rates; writes happen only via the Edge
-- Function using the service-role key (no client write policy → denied).
drop policy if exists "fx_rates_read" on public.fx_rates;
create policy "fx_rates_read" on public.fx_rates
  for select to authenticated using (true);
