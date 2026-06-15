-- Onboarding branch + mandatory photo gallery.
--
-- Adds `intent` (the "What brings you to Love meet?" answer — relationship
-- vs fun, used to decide whether the detailed questionnaire is shown) and
-- `gallery_urls` (the 5-photo gallery filled in on the final onboarding
-- step, regardless of path). These are the photos the feed renders.
--
-- Numbered 0092 to avoid colliding with the in-flight 0089-0091 coins/legacy
-- migrations on another branch.

alter table public.profiles
  add column if not exists intent       text,
  add column if not exists gallery_urls text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_intent_check;
alter table public.profiles add  constraint profiles_intent_check
  check (intent is null or intent in ('relationship', 'fun'));

alter table public.profiles drop constraint if exists profiles_gallery_max_check;
alter table public.profiles add  constraint profiles_gallery_max_check
  check (array_length(gallery_urls, 1) is null or array_length(gallery_urls, 1) <= 5);
