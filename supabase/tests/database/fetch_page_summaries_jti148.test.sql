-- JTI-148: fetch_page_summaries_for_reader — batched pages + next_page_hints; max batch 32.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'dddddddd-dddd-4ddd-dddd-dddddddddddd'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti148_user@test.local',
  crypt('unused', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  'dddddddd-dddd-4ddd-dddd-dddddddddddd'::uuid,
  'dddddddd-dddd-4ddd-dddd-dddddddddddd'::uuid,
  '{"sub":"dddddddd-dddd-4ddd-dddd-dddddddddddd","email":"jti148_user@test.local"}'::jsonb,
  'email',
  'dddddddd-dddd-4ddd-dddd-dddddddddddd'::uuid,
  now(),
  now(),
  now()
);

insert into public.books (
  id,
  user_id,
  title,
  source_filename,
  storage_bucket,
  storage_path,
  byte_size,
  page_count,
  status
)
values (
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
  'dddddddd-dddd-4ddd-dddd-dddddddddddd'::uuid,
  'Prefetch test',
  'x.pdf',
  'book_pdfs',
  'dddddddd-dddd-4ddd-dddd-dddddddddddd/eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee.pdf',
  100,
  10,
  'ready'
);

insert into public.page_summaries (book_id, page_index, status, summary_text)
values
  ('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid, 1, 'ready', 'Summary one'),
  ('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid, 2, 'processing', null),
  ('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid, 3, 'failed', null);

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

select ok(
  (
    select (r->>'ok')::boolean
      and (r->'pages'->0->>'page_index')::int = 3
      and (r->'pages'->0->>'status') = 'failed'
      and (r->'pages'->1->>'page_index')::int = 1
      and (r->'pages'->1->>'status') = 'ready'
      and (r->'pages'->1->>'summary_text') = 'Summary one'
      and (r->'pages'->2->>'status') = 'pending'
      and jsonb_array_length(r->'next_page_hints') = 3
      and (r->'next_page_hints'->0->>'page_index')::int = 5
      and (r->>'max_batch_size')::int = 32
    from (
      select public.fetch_page_summaries_for_reader(
        'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
        array[3, 1, 4]::integer[]
      ) as r
    ) s
  ),
  'Spot-check JSON shape and next_page_hints length'
);

select results_eq(
  $q$
    select public.fetch_page_summaries_for_reader(
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
      array[11]::integer[]
    )->'pages'->0
  $q$,
  $v$ values (
    jsonb_build_object(
      'page_index', 11,
      'status', 'invalid_page_index',
      'summary_text', null,
      'error_code', 'invalid_page_index',
      'error_message', 'This book has 10 pages; page 11 is out of range.',
      'updated_at', null
    )
  ) $v$,
  'Out-of-range page returns invalid_page_index (no DB row required)'
);

select is(
  (
    select public.fetch_page_summaries_for_reader(
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
      (select array_agg(gs::int) from generate_series(1, 33) gs)
    )->>'error'
  ),
  'batch_too_large',
  '33 indices rejected (max 32)'
);

select is(
  (
    select public.fetch_page_summaries_for_reader(
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
      array[1, 1]::integer[]
    )->>'error'
  ),
  'duplicate_page_indices',
  'Duplicate indices rejected'
);

select is(
  (
    select public.fetch_page_summaries_for_reader(
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
      '{}'::integer[]
    )->>'error'
  ),
  'page_indices_required',
  'Empty array rejected'
);

select * from finish();

rollback;
