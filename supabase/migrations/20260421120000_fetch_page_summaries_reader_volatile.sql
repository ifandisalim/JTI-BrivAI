-- PostgreSQL forbids FOR SHARE / FOR UPDATE inside STABLE or IMMUTABLE functions (SQLSTATE 0A000).
-- fetch_page_summaries_for_reader used FOR SHARE on books while marked STABLE.
-- VOLATILE matches session-scoped reads (auth.uid(), changing page_summaries).

create or replace function public.fetch_page_summaries_for_reader(
  p_book_id uuid,
  p_page_indices integer[]
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b_user_id uuid;
  page_count_val integer;
  arr_len integer;
  max_batch constant integer := 32;
  max_req integer;
  pages_json jsonb;
  hints_json jsonb;
begin
  if uid is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_authenticated',
      'max_batch_size', max_batch
    );
  end if;

  if p_book_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'book_id_required',
      'max_batch_size', max_batch
    );
  end if;

  arr_len := coalesce(cardinality(p_page_indices), 0);

  if arr_len = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'page_indices_required',
      'max_batch_size', max_batch
    );
  end if;

  if arr_len > max_batch then
    return jsonb_build_object(
      'ok', false,
      'error', 'batch_too_large',
      'max_batch_size', max_batch,
      'requested_count', arr_len
    );
  end if;

  if arr_len <> (
    select count(distinct x)
    from unnest(p_page_indices) as t(x)
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'duplicate_page_indices',
      'max_batch_size', max_batch
    );
  end if;

  if exists (
    select 1
    from unnest(p_page_indices) as q(p)
    where q.p is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'null_page_index',
      'max_batch_size', max_batch
    );
  end if;

  select b.user_id, b.page_count
    into b_user_id, page_count_val
  from public.books b
  where b.id = p_book_id
  for share;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'book_not_found',
      'max_batch_size', max_batch
    );
  end if;

  if b_user_id is distinct from uid then
    return jsonb_build_object(
      'ok', false,
      'error', 'forbidden',
      'max_batch_size', max_batch
    );
  end if;

  select coalesce(max(p), 0)
    into max_req
  from unnest(p_page_indices) as q(p)
  where p >= 1
    and (page_count_val is null or p <= page_count_val);

  with ordered as (
    select u.page_index, u.ordinality::int as ord
    from unnest(p_page_indices) with ordinality as u(page_index, ordinality)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'page_index', o.page_index,
        'status',
        case
          when o.page_index < 1 then 'invalid_page_index'
          when page_count_val is not null and o.page_index > page_count_val then 'invalid_page_index'
          when ps.id is null
            and (page_count_val is null or o.page_index <= page_count_val) then 'pending'
          else ps.status
        end,
        'summary_text',
        case
          when o.page_index < 1 then null
          when page_count_val is not null and o.page_index > page_count_val then null
          else ps.summary_text
        end,
        'error_code',
        case
          when o.page_index < 1 then 'invalid_page_index'
          when page_count_val is not null and o.page_index > page_count_val then 'invalid_page_index'
          else ps.error_code
        end,
        'error_message',
        case
          when o.page_index < 1 then 'Page index must be at least 1.'
          when page_count_val is not null and o.page_index > page_count_val then
            format('This book has %s pages; page %s is out of range.', page_count_val, o.page_index)
          else ps.error_message
        end,
        'updated_at', ps.updated_at
      )
      order by o.ord
    ),
    '[]'::jsonb
  )
  into pages_json
  from ordered o
  left join public.page_summaries ps
    on ps.book_id = p_book_id
   and ps.page_index = o.page_index;

  if max_req < 1 then
    hints_json := '[]'::jsonb;
  else
    with hint_indices as (
      select gs::integer as page_index
      from generate_series(max_req + 1, max_req + 3) as gs
      where gs >= 1
        and (page_count_val is null or gs <= page_count_val)
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'page_index', hi.page_index,
          'status', coalesce(ps.status, 'pending'),
          'summary_text', ps.summary_text,
          'error_code', ps.error_code,
          'error_message', ps.error_message,
          'updated_at', ps.updated_at
        )
        order by hi.page_index
      ),
      '[]'::jsonb
    )
    into hints_json
    from hint_indices hi
    left join public.page_summaries ps
      on ps.book_id = p_book_id
     and ps.page_index = hi.page_index;
  end if;

  return jsonb_build_object(
    'ok', true,
    'book_id', p_book_id,
    'page_count', page_count_val,
    'pages', pages_json,
    'next_page_hints', hints_json,
    'max_batch_size', max_batch
  );
end;
$$;

comment on function public.fetch_page_summaries_for_reader(uuid, integer[]) is
  'JTI-148: Reader prefetch — batched status/summary for page_indices (1-based), plus up to 3 following in-range pages as hints. '
  'Max batch size is 32 (MVP mobile payload guard; books cap at 300 pages per README).';

revoke all on function public.fetch_page_summaries_for_reader(uuid, integer[]) from public;
grant execute on function public.fetch_page_summaries_for_reader(uuid, integer[]) to authenticated;
