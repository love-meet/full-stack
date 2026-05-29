-- "Help us match you" interview answers (15 questions). Each user gets one
-- row holding two JSONB blobs: answers about the partner they want and
-- mirrored answers about themselves. completed_at is set when they finish
-- the flow, which is the gate for skipping the post-interview prompt.

create table if not exists public.match_preferences (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  partner      jsonb not null default '{}'::jsonb,
  self         jsonb not null default '{}'::jsonb,
  plan_goal    text,                              -- 'free' | 'premium' | 'vip'
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.match_preferences enable row level security;

drop policy if exists "match_prefs_self_select" on public.match_preferences;
create policy "match_prefs_self_select" on public.match_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "match_prefs_self_upsert" on public.match_preferences
;
create policy "match_prefs_self_upsert" on public.match_preferences
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "match_prefs_self_update" on public.match_preferences;
create policy "match_prefs_self_update" on public.match_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public._touch_match_prefs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists match_prefs_touch_updated_at on public.match_preferences;
create trigger match_prefs_touch_updated_at
  before update on public.match_preferences
  for each row execute function public._touch_match_prefs_updated_at();
