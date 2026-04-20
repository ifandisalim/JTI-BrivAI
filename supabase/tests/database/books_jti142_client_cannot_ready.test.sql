-- JTI-142 / JTI-143: Authenticated users cannot bypass server validation by setting `books.status` to `ready` or `validating`.
-- Run: npx supabase test db (requires Docker; migrations applied before tests).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(2);

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
  'dddddddd-bbbb-4ddd-addd-dddddddddddd'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti142_user@test.local',
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
  'dddddddd-bbbb-4ddd-addd-dddddddddddd'::uuid,
  'dddddddd-bbbb-4ddd-addd-dddddddddddd'::uuid,
  '{"sub":"dddddddd-bbbb-4ddd-addd-dddddddddddd","email":"jti142_user@test.local"}'::jsonb,
  'email',
  'dddddddd-bbbb-4ddd-addd-dddddddddddd'::uuid,
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
  'eeeeeeee-bbbb-4eee-addd-eeeeeeeeeeee'::uuid,
  'dddddddd-bbbb-4ddd-addd-dddddddddddd'::uuid,
  'Test',
  'x.pdf',
  'book_pdfs',
  'dddddddd-bbbb-4ddd-addd-dddddddddddd/eeeeeeee-bbbb-4eee-addd-eeeeeeeeeeee.pdf',
  100,
  'uploading'
);

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-bbbb-4ddd-addd-dddddddddddd';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$
    update public.books
    set status = 'ready', page_count = 1, error_code = null, error_message = null
    where id = 'eeeeeeee-bbbb-4eee-addd-eeeeeeeeeeee'::uuid;
  $$,
  '42501',
  null,
  'JTI-142/DoD: client RLS blocks marking book ready without server'
);

select throws_ok(
  $$
    update public.books
    set status = 'validating', error_code = null, error_message = null
    where id = 'eeeeeeee-bbbb-4eee-addd-eeeeeeeeeeee'::uuid;
  $$,
  '42501',
  null,
  'JTI-143/DoD: client RLS blocks skipping server by setting validating'
);

select * from finish();

rollback;
