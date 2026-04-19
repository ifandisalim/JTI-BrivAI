-- JTI-139: consume_credit — row lock, insufficient funds, idempotency (AC-139-1, AC-139-2).
-- Run: npx supabase test db (requires Docker; migrations applied before tests).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- Fresh auth user → profile + starter grant (50 credits).
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
  'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'jti139_user@test.local',
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
  'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid,
  'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid,
  '{"sub":"dddddddd-bbbb-4ccc-addd-dddddddddddd","email":"jti139_user@test.local"}'::jsonb,
  'email',
  'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid,
  now(),
  now(),
  now()
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.consume_credit(text, integer)',
    'execute'
  ),
  'DoD: authenticated role has EXECUTE on public.consume_credit(text, int)'
);

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-bbbb-4ccc-addd-dddddddddddd';

select results_eq(
  $q$ select public.consume_credit('jti139:idem:1', 1) $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'charged', true,
      'balance', 49
    )
  ) $v$,
  'First consume: charged, balance 49'
);

select results_eq(
  $q$ select public.consume_credit('jti139:idem:1', 1) $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'charged', false,
      'balance', 49
    )
  ) $v$,
  'AC-139-1: duplicate idempotency key — charged false, balance unchanged'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid
  ),
  49,
  'AC-139-1: balance reduced at most once for same idempotency key'
);

reset role;

perform set_config('app.allow_credit_balance_write', 'on', true);

update public.profiles
set credit_balance = 0
where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-bbbb-4ccc-addd-dddddddddddd';

select results_eq(
  $q$ select public.consume_credit('jti139:insufficient', 1) $q$,
  $v$ values (
    jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'balance', 0
    )
  ) $v$,
  'Insufficient credits: no charge, balance 0'
);

select is(
  (
    select count(*)::bigint
    from public.credit_ledger
    where user_id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid
      and idempotency_key = 'jti139:insufficient'
  ),
  0::bigint,
  'Insufficient path does not insert a ledger row'
);

reset role;

perform set_config('app.allow_credit_balance_write', 'on', true);

update public.profiles
set credit_balance = 1
where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-bbbb-4ccc-addd-dddddddddddd';

select results_eq(
  $q$ select public.consume_credit('jti139:cost_gt_balance', 2) $q$,
  $v$ values (
    jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'balance', 1
    )
  ) $v$,
  'AC-139-2: cost above balance — rejected, balance unchanged'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid
  ),
  1,
  'AC-139-2: balance cannot go negative (stays 1 after failed consume)'
);

reset role;

perform set_config('app.allow_credit_balance_write', 'on', true);

update public.profiles
set credit_balance = 3
where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-bbbb-4ccc-addd-dddddddddddd';

select results_eq(
  $q$ select public.consume_credit('jti139:exact_spend', 3) $q$,
  $v$ values (
    jsonb_build_object(
      'ok', true,
      'charged', true,
      'balance', 0
    )
  ) $v$,
  'Exact spend allowed down to zero'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = 'dddddddd-bbbb-4ccc-addd-dddddddddddd'::uuid
  ),
  0,
  'Balance is exactly zero after full spend (not negative)'
);

select * from finish();

rollback;
