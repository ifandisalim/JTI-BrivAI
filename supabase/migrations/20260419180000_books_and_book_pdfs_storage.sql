-- JTI-141 / Epic 128: `books` rows + private `book_pdfs` bucket with user-prefix RLS.
-- Upload strategy: insert `books` with status `uploading`, then upload to `{user_id}/{book_id}.pdf`.

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  source_filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  byte_size bigint not null,
  page_count integer,
  status text not null default 'uploading',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_status_check check (
    status in ('uploading', 'validating', 'ready', 'failed')
  )
);

comment on table public.books is 'Per-upload PDF metadata; bytes live in Storage at storage_bucket/storage_path.';

create index if not exists books_user_created_desc on public.books (user_id, created_at desc);

create or replace function public.books_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_touch_updated_at on public.books;

create trigger books_touch_updated_at
before update on public.books
for each row
execute procedure public.books_touch_updated_at();

alter table public.books enable row level security;

create policy "books_select_own"
on public.books
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "books_insert_own"
on public.books
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "books_update_own"
on public.books
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('book_pdfs', 'book_pdfs', false)
on conflict (id) do nothing;

-- Client may remove a partial object after a failed/cancelled upload (own prefix only).
create policy "book_pdfs_insert_own_prefix"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book_pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) = 'pdf'
);

create policy "book_pdfs_select_own_prefix"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'book_pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "book_pdfs_update_own_prefix"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'book_pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'book_pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) = 'pdf'
);

create policy "book_pdfs_delete_own_prefix"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'book_pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
