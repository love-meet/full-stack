-- Fix: "function gen_salt(unknown, integer) does not exist" when setting a PIN.
--
-- set_pin / verify_pin were defined with `set search_path = public`, but on
-- Supabase the pgcrypto extension (crypt, gen_salt) lives in the `extensions`
-- schema, not public — so those functions weren't on the path and the call
-- failed to resolve. Add `extensions` to the search_path of both functions.
-- (Schema-qualifying as a safety net too, in case the ext is in public.)

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_pin(new_pin text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare my_id uuid := auth.uid();
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  if new_pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;

  insert into public.account_pins (user_id, pin_hash, updated_at)
       values (my_id, crypt(new_pin, gen_salt('bf', 8)), now())
  on conflict (user_id) do update
       set pin_hash = excluded.pin_hash,
           updated_at = now();
end $$;

grant execute on function public.set_pin(text) to authenticated;

create or replace function public.verify_pin(candidate text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  my_id uuid := auth.uid();
  stored text;
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  select pin_hash into stored from public.account_pins where user_id = my_id;
  if stored is null then return false; end if;
  return stored = crypt(candidate, stored);
end $$;

grant execute on function public.verify_pin(text) to authenticated;
