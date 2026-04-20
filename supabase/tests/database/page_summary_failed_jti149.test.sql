-- JTI-149: save_page_summary_failed — failed row + error fields; never overwrites ready.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(6);

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
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti149_user@test.local',
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
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
  '{"sub":"eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee","email":"jti149_user@test.local"}'::jsonb,
  'email',
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
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
  'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid,
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid,
  'JTI-149 book',
  'y.pdf',
  'book_pdfs',
  'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee/ffffffff-ffff-4fff-ffff-ffffffffffff.pdf',
  100,
  5,
  'ready'
);

set local role service_role;

select results_eq(
  $q$
    select public.save_page_summary_failed(
      'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid,
      1,
      'page_text_empty',
      'There is no readable text on this page to summarise.',
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid
    )
  $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'status', 'failed',
      'error_code', 'page_text_empty',
      'error_message', 'There is no readable text on this page to summarise.'
    )
  ) $v$,
  'First failure: row failed with error fields'
);

select is(
  (
    select status
    from public.page_summaries
    where book_id = 'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid
      and page_index = 1
  ),
  'failed',
  'Row status is failed'
);

select results_eq(
  $q$
    select public.save_page_summary_failed(
      'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid,
      1,
      'provider_error',
      'Updated message after retry exhausted.',
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid
    )
  $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'status', 'failed',
      'error_code', 'provider_error',
      'error_message', 'Updated message after retry exhausted.'
    )
  ) $v$,
  'Second failure call: updates error fields on same row'
);

set local role authenticated;
set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

select public.save_page_summary_ready(
  'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid,
  2,
  'Summary for page two is ready.'
);

set local role service_role;

select results_eq(
  $q$
    select public.save_page_summary_failed(
      'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid,
      2,
      'should_not_apply',
      'Should not overwrite ready.',
      'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'::uuid
    )
  $q$,
  $v$ values (jsonb_build_object('ok', false, 'error', 'unexpected_ready')) $v$,
  'Cannot mark failed when page is already ready'
);

select is(
  (
    select status
    from public.page_summaries
    where book_id = 'ffffffff-ffff-4fff-ffff-ffffffffffff'::uuid
      and page_index = 2
  ),
  'ready',
  'Ready page unchanged after failed save attempt'
);

select * from finish();

rollback;
