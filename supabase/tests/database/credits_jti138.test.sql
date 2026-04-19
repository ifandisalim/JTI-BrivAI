-- JTI-138: starter grant on new profile — balance 50, idempotent key, audit conventions.
-- Run: npx supabase test db (requires Docker; migrations applied before tests).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- Fresh auth user → handle_new_user inserts profile → starter grant trigger runs.
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
  'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti138_user@test.local',
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
  'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid,
  'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid,
  '{"sub":"cccccccc-bbbb-4ccc-addd-cccccccccccc","email":"jti138_user@test.local"}'::jsonb,
  'email',
  'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid,
  now(),
  now(),
  now()
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  50,
  'AC-138-1/DoD: first profile insert grants 50 credits at default economics'
);

select is(
  (
    select delta::integer
    from public.credit_ledger
    where user_id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  50,
  'AC-138-2: ledger delta is starter grant amount'
);

select is(
  (
    select reason
    from public.credit_ledger
    where user_id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  'starter_grant',
  'AC-138-2: ledger reason is starter_grant'
);

select is(
  (
    select idempotency_key
    from public.credit_ledger
    where user_id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  'starter_grant:cccccccc-bbbb-4ccc-addd-cccccccccccc',
  'AC-138-2: idempotency key is starter_grant:<user_id>'
);

-- Replay same logical grant (same as trigger’s insert); must not double-credit.
insert into public.credit_ledger (user_id, delta, reason, idempotency_key)
values (
  'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid,
  50,
  'starter_grant',
  'starter_grant:cccccccc-bbbb-4ccc-addd-cccccccccccc'
)
on conflict (user_id, idempotency_key) do nothing;

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  50,
  'AC-138-1: replay with same starter idempotency key does not increase balance'
);

select is(
  (
    select count(*)::bigint
    from public.credit_ledger
    where user_id = 'cccccccc-bbbb-4ccc-addd-cccccccccccc'::uuid
  ),
  1::bigint,
  'AC-138-1: replay does not insert a second ledger row'
);

select * from finish();

rollback;
