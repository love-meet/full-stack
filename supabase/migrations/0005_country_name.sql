-- Adds the user-facing country name alongside the ISO code.
--   country_code — kept as-is, ISO 3166-1 alpha-2 (e.g. "NG"). Used for
--                  cross-country filtering and search (M6).
--   country_name — full English name (e.g. "Nigeria"). Used for display.
--
-- Run after 0004_explore.sql.

alter table public.profiles
  add column if not exists country_name text;

-- Optional convenience index — cheap, useful if we ever sort/group by
-- country name in admin dashboards.
create index if not exists profiles_country_name_idx
  on public.profiles (country_name);
