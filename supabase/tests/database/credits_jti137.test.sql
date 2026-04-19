-- JTI-137: schema defaults, RLS enabled, no direct DML privilege for authenticated on credit_ledger.
-- Run: npx supabase test db (requires Docker + pgTAP enabled on the test DB).

begin;

select plan(5);

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

select * from finish();

rollback;
