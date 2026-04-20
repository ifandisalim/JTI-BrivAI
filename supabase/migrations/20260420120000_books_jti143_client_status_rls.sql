-- JTI-143: Enforce `uploading` → `validating` → (`ready`|`failed`) on the server.
-- Authenticated clients may move to `failed` (or stay in `uploading` while fixing metadata) but
-- must not set `validating` or `ready` (those transitions are for service role / Edge Functions).

drop policy if exists "books_update_own" on public.books;

create policy "books_update_own"
on public.books
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not (
    (select auth.role()) = 'authenticated'
    and status in ('validating', 'ready')
  )
);

comment on column public.books.status is
  'MVP state machine (JTI-143): uploading → validating → ready | failed. Server sets validating/ready; client may set failed.';
