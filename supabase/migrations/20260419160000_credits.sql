-- Epic 127 (Credits): balance on profiles + append-only ledger + starter grant + consume RPC.
-- Numeric defaults MUST match apps/mobile/src/config/credits.ts (STARTER_FREE_PAGES=50, CREDITS_PER_SUMMARIZED_PAGE=1 → starter grant 50 credits).

alter table public.profiles
  add column if not exists credit_balance integer not null default 0;

-- Prevent authenticated clients from PATCHing credit_balance while still allowing email updates, etc.
create or replace function public.profiles_credit_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.credit_balance is distinct from old.credit_balance then
    if coalesce(current_setting('app.allow_credit_balance_write', true), '') <> 'on' then
      raise exception 'credit_balance is server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_credit_balance_guard_trg on public.profiles;

create trigger profiles_credit_balance_guard_trg
  before update on public.profiles
  for each row
  execute procedure public.profiles_credit_balance_guard();

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  reason text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credit_ledger_idempotency unique (user_id, idempotency_key)
);

comment on table public.credit_ledger is 'Append-only credit movements; writes only via SECURITY DEFINER functions/triggers.';

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

create policy "credit_ledger_select_own"
on public.credit_ledger
for select
to authenticated
using ((select auth.uid()) = user_id);

-- No insert/update/delete policies for authenticated: clients cannot write ledger rows directly.

create or replace function public.grant_starter_credits_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_amount int := 50; -- = STARTER_FREE_PAGES * CREDITS_PER_SUMMARIZED_PAGE at MVP defaults
  inserted_count int;
begin
  insert into public.credit_ledger (user_id, delta, reason, idempotency_key)
  values (NEW.id, grant_amount, 'starter_grant', 'starter_grant:' || NEW.id::text)
  on conflict (user_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    perform set_config('app.allow_credit_balance_write', 'on', true);
    update public.profiles
      set credit_balance = credit_balance + grant_amount
      where id = NEW.id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists grant_starter_credits_after_profile_insert on public.profiles;

create trigger grant_starter_credits_after_profile_insert
  after insert on public.profiles
  for each row
  execute procedure public.grant_starter_credits_on_profile();

create or replace function public.consume_credit(p_idempotency_key text, p_cost int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_balance int;
  inserted_count int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key');
  end if;

  if p_cost is null or p_cost < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_cost');
  end if;

  select p.credit_balance
    into current_balance
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  if current_balance < p_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'balance', current_balance);
  end if;

  insert into public.credit_ledger (user_id, delta, reason, idempotency_key)
  values (uid, -p_cost, 'page_summary', p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    perform set_config('app.allow_credit_balance_write', 'on', true);
    update public.profiles
      set credit_balance = credit_balance - p_cost
      where id = uid
      returning credit_balance into current_balance;

    return jsonb_build_object('ok', true, 'charged', true, 'balance', current_balance);
  end if;

  select p.credit_balance into current_balance from public.profiles p where p.id = uid;

  return jsonb_build_object('ok', true, 'charged', false, 'balance', current_balance);
end;
$$;

revoke all on function public.consume_credit(text, int) from public;
grant execute on function public.consume_credit(text, int) to authenticated;
