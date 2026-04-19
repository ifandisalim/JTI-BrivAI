-- JTI-142: Only trusted server paths (service role / Edge Functions) may mark a book `ready`.
-- Authenticated clients may set `validating`, `failed`, `uploading`, etc.; they cannot self-mark `ready`.

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
    and status = 'ready'
  )
);
