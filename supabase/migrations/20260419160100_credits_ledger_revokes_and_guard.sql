-- JTI-137: explicit client DML denial on credit_ledger (defense in depth with RLS).
-- Balance guard: treat missing session flag as "not allowed" using IS DISTINCT FROM.

create or replace function public.profiles_credit_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.credit_balance is distinct from old.credit_balance then
    if current_setting('app.allow_credit_balance_write', true) is distinct from 'on' then
      raise exception 'credit_balance is server-managed';
    end if;
  end if;
  return new;
end;
$$;

revoke insert, update, delete on public.credit_ledger from public;
revoke insert, update, delete on public.credit_ledger from anon, authenticated;

grant select on public.credit_ledger to authenticated;
