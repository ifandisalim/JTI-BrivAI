-- JTI-147: page_summaries unique (book_id, page_index); save_page_summary_ready idempotent (no re-charge when ready).
-- Run: npx supabase test db (requires Docker; migrations applied before tests).

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
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti147_user@test.local',
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
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
  '{"sub":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","email":"jti147_user@test.local"}'::jsonb,
  'email',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
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
  'cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid,
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
  'Test book',
  'x.pdf',
  'book_pdfs',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-cccc-cccccccccccc.pdf',
  100,
  5,
  'ready'
);

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

select results_eq(
  $q$
    select public.save_page_summary_ready(
      'cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid,
      2,
      'First summary text for page two.'
    )
  $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'status', 'ready',
      'summary_text', 'First summary text for page two.',
      'credit_charged', true,
      'credit_balance', 49,
      'already_ready', false
    )
  ) $v$,
  'First save: row ready, one credit charged (starter was 50)'
);

select is(
  (
    select count(*)::int
    from public.page_summaries
    where book_id = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid
      and page_index = 2
  ),
  1,
  'Exactly one page_summaries row for (book, page)'
);

select results_eq(
  $q$
    select public.save_page_summary_ready(
      'cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid,
      2,
      'Would be different text but should be ignored when already ready.'
    )
  $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'status', 'ready',
      'summary_text', 'First summary text for page two.',
      'credit_charged', false,
      'already_ready', true
    )
  ) $v$,
  'Second save: same stored text, no re-charge (idempotent)'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid
  ),
  49,
  'Balance still 49 after idempotent second call'
);

savepoint jti147_unique_violation;

select throws_ok(
  $q$
    insert into public.page_summaries (book_id, page_index, status)
    values ('cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid, 2, 'pending')
  $q$,
  '23505',
  'unique(book_id, page_index) enforced'
);

rollback to savepoint jti147_unique_violation;

select * from finish();

rollback;
