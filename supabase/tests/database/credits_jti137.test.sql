-- JTI-137: credit_balance defaults, RLS isolation on credit_ledger, no direct client writes.
-- Run: npx supabase test db (requires Docker; migrations applied before tests).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Two auth users → handle_new_user creates profiles → starter grant creates ledger rows.
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
values
  (
    'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'jti137_user_a@test.local',
    crypt('unused', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'jti137_user_b@test.local',
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
values
  (
    'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa'::uuid,
    'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa'::uuid,
    '{"sub":"aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa","email":"jti137_user_a@test.local"}'::jsonb,
    'email',
    'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa'::uuid,
    now(),
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb'::uuid,
    'bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb'::uuid,
    '{"sub":"bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb","email":"jti137_user_b@test.local"}'::jsonb,
    'email',
    'bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb'::uuid,
    now(),
    now(),
    now()
  );

select has_column(
  'public',
  'profiles',
  'credit_balance',
  'AC-137-3: profiles.credit_balance column exists'
);

select col_not_null(
  'public',
  'profiles',
  'credit_balance',
  'AC-137-3: credit_balance is NOT NULL'
);

select ok(
  exists (
    select 1
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and a.attname = 'credit_balance'
      and not a.attisdropped
      and pg_get_expr(d.adbin, d.adrelid) in ('0', '0::integer')
  ),
  'AC-137-3: credit_balance column default is 0'
);

select is(
  (select count(*)::bigint from public.profiles where credit_balance is null),
  0::bigint,
  'AC-137-3: no NULL credit_balance on existing rows'
);

select rls_enabled(
  'public',
  'credit_ledger',
  'credit_ledger has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.credit_ledger', 'insert')
  and not has_table_privilege('authenticated', 'public.credit_ledger', 'update')
  and not has_table_privilege('authenticated', 'public.credit_ledger', 'delete'),
  'AC-137-2: authenticated has no direct INSERT/UPDATE/DELETE on credit_ledger'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa';

select is(
  (select count(*)::bigint from public.credit_ledger),
  1::bigint,
  'AC-137-1: user A sees only their ledger row(s)'
);

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4ccc-addd-bbbbbbbbbbbb';

select is(
  (select count(*)::bigint from public.credit_ledger),
  1::bigint,
  'AC-137-1: user B sees only their ledger row(s)'
);

set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa';

select throws_ok(
  $iq$
    insert into public.credit_ledger (user_id, delta, reason, idempotency_key)
    values (
      'aaaaaaaa-bbbb-4ccc-addd-aaaaaaaaaaaa'::uuid,
      1,
      'direct_insert_test',
      'direct_insert_test:ac137'
    )
  $iq$,
  '42501',
  null,
  'AC-137-2: authenticated cannot insert into credit_ledger directly'
);

select * from finish();

rollback;
