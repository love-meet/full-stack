-- Comments table (0002) was missing an UPDATE policy too — same shape of
-- silent RLS denial as 0011 fixed for posts. Allow the author to update
-- their own comment body.

drop policy if exists "comments_update_own" on public.post_comments;
create policy "comments_update_own"
  on public.post_comments
  for update
  to authenticated
  using  (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    -- Author can change the body but not move the comment to a different
    -- post or under a different parent.
  );
