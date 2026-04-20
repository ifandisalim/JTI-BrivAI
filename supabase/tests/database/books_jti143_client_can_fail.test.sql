-- JTI-143: Clients may mark their own book `failed` while in `uploading` (e.g. read/upload errors).
-- `validating` and `ready` remain server-only (see books_jti142_client_cannot_ready.test.sql).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(1);

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
  'cccccccc-bbbb-4ccc-accc-cccccccccccc'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti143_fail_user@test.local',
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
  'cccccccc-bbbb-4ccc-accc-cccccccccccc'::uuid,
  'cccccccc-bbbb-4ccc-accc-cccccccccccc'::uuid,
  '{"sub":"cccccccc-bbbb-4ccc-accc-cccccccccccc","email":"jti143_fail_user@test.local"}'::jsonb,
  'email',
  'cccccccc-bbbb-4ccc-accc-cccccccccccc'::uuid,
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
  status
)
values (
  'aaaaaaaa-bbbb-4aaa-addd-aaaaaaaaaaaa'::uuid,
  'cccccccc-bbbb-4ccc-accc-cccccccccccc'::uuid,
  'Test',
  'x.pdf',
  'book_pdfs',
  'cccccccc-bbbb-4ccc-accc-cccccccccccc/aaaaaaaa-bbbb-4aaa-addd-aaaaaaaaaaaa.pdf',
  100,
  'uploading'
);

set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-bbbb-4ccc-accc-cccccccccccc';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$
    update public.books
    set
      status = 'failed',
      error_code = 'read_error',
      error_message = 'Could not read this PDF from your device.'
    where id = 'aaaaaaaa-bbbb-4aaa-addd-aaaaaaaaaaaa'::uuid;
  $$,
  'JTI-143/DoD: client may set failed from uploading with error fields'
);

select * from finish();

rollback;
