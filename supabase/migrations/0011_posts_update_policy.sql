-- The original posts table (0002) was missing an UPDATE policy. RLS denies
-- updates silently and PostgREST then throws "Cannot coerce the result to
-- a single JSON object" because .single() saw 0 rows. Fix: allow the author
-- to update their own post.

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
