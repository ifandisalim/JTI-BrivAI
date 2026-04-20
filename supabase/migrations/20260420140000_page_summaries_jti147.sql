-- JTI-147 (Epic 129 §10): Persist per-page summaries keyed by (book_id, page_index).
-- Idempotent ready rows + credit charge only once per page (stable idempotency key).

create table if not exists public.page_summaries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  page_index integer not null,
  status text not null default 'pending',
  summary_text text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_summaries_page_index_positive check (page_index >= 1),
  constraint page_summaries_status_check check (
    status in ('pending', 'processing', 'ready', 'failed')
  ),
  constraint page_summaries_book_page_unique unique (book_id, page_index)
);

comment on table public.page_summaries is
  'Mode A: one row per PDF page per book; unique (book_id, page_index). Server writes preferred (JTI-147).';

create index if not exists page_summaries_book_page_idx
  on public.page_summaries (book_id, page_index);

create or replace function public.page_summaries_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists page_summaries_touch_updated_at on public.page_summaries;

create trigger page_summaries_touch_updated_at
before update on public.page_summaries
for each row
execute procedure public.page_summaries_touch_updated_at();

alter table public.page_summaries enable row level security;

create policy "page_summaries_select_own_book"
on public.page_summaries
for select
to authenticated
using (
  exists (
    select 1
    from public.books b
    where b.id = page_summaries.book_id
      and b.user_id = (select auth.uid())
  )
);

-- Writes go through SECURITY DEFINER RPCs / service role; clients do not insert/update directly.

create or replace function public.save_page_summary_ready(
  p_book_id uuid,
  p_page_index integer,
  p_summary_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b_user_id uuid;
  existing_status text;
  existing_summary text;
  idem_key text;
  consume_result jsonb;
  final_summary text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_book_id is null then
    return jsonb_build_object('ok', false, 'error', 'book_id_required');
  end if;

  if p_page_index is null or p_page_index < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_page_index');
  end if;

  if p_summary_text is null or length(trim(p_summary_text)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'summary_text_required');
  end if;

  select b.user_id
    into b_user_id
  from public.books b
  where b.id = p_book_id
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'book_not_found');
  end if;

  if b_user_id is distinct from uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select ps.status, ps.summary_text
    into existing_status, existing_summary
  from public.page_summaries ps
  where ps.book_id = p_book_id
    and ps.page_index = p_page_index;

  if found and existing_status = 'ready' then
    return jsonb_build_object(
      'ok', true,
      'status', 'ready',
      'summary_text', existing_summary,
      'credit_charged', false,
      'already_ready', true
    );
  end if;

  idem_key := 'summary_charge:' || p_book_id::text || ':' || p_page_index::text;

  select public.consume_credit(idem_key, 1) into consume_result;

  if coalesce((consume_result->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(consume_result->>'error', 'consume_credit_failed'),
      'consume_credit', consume_result
    );
  end if;

  insert into public.page_summaries (
    book_id,
    page_index,
    status,
    summary_text,
    error_code,
    error_message
  )
  values (
    p_book_id,
    p_page_index,
    'ready',
    p_summary_text,
    null,
    null
  )
  on conflict (book_id, page_index) do update
    set
      status = 'ready',
      summary_text = excluded.summary_text,
      error_code = null,
      error_message = null
    where page_summaries.status is distinct from 'ready';

  select ps.summary_text
    into final_summary
  from public.page_summaries ps
  where ps.book_id = p_book_id
    and ps.page_index = p_page_index;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'summary_text', coalesce(final_summary, p_summary_text),
    'credit_charged', coalesce((consume_result->>'charged')::boolean, false),
    'credit_balance', consume_result->'balance',
    'already_ready', false
  );
end;
$$;

comment on function public.save_page_summary_ready(uuid, integer, text) is
  'JTI-147: Upsert ready summary for (book_id, page_index); idempotent when already ready (no re-charge). '
  'Credit idempotency key format: summary_charge:{book_id}:{page_index}.';

revoke all on function public.save_page_summary_ready(uuid, integer, text) from public;
grant execute on function public.save_page_summary_ready(uuid, integer, text) to authenticated;
