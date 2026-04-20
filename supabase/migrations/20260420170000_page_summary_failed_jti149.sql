-- JTI-149 (Epic 129 §12): Persist per-page failure (error_code / error_message) without touching ready rows.
-- Called from Edge with service role; p_user_id must match books.user_id (caller already validated JWT).

create or replace function public.save_page_summary_failed(
  p_book_id uuid,
  p_page_index integer,
  p_error_code text,
  p_error_message text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b_user_id uuid;
  existing_status text;
begin
  if p_book_id is null then
    return jsonb_build_object('ok', false, 'error', 'book_id_required');
  end if;

  if p_page_index is null or p_page_index < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_page_index');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_id_required');
  end if;

  if p_error_code is null or length(trim(p_error_code)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'error_code_required');
  end if;

  if p_error_message is null or length(trim(p_error_message)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'error_message_required');
  end if;

  select b.user_id
    into b_user_id
  from public.books b
  where b.id = p_book_id
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'book_not_found');
  end if;

  if b_user_id is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select ps.status
    into existing_status
  from public.page_summaries ps
  where ps.book_id = p_book_id
    and ps.page_index = p_page_index;

  if found and existing_status = 'ready' then
    return jsonb_build_object('ok', false, 'error', 'unexpected_ready');
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
    'failed',
    null,
    trim(p_error_code),
    trim(p_error_message)
  )
  on conflict (book_id, page_index) do update
    set
      status = 'failed',
      summary_text = null,
      error_code = excluded.error_code,
      error_message = excluded.error_message
    where page_summaries.status is distinct from 'ready';

  return jsonb_build_object(
    'ok', true,
    'status', 'failed',
    'error_code', trim(p_error_code),
    'error_message', trim(p_error_message)
  );
end;
$$;

comment on function public.save_page_summary_failed(uuid, integer, text, text, uuid) is
  'JTI-149: Mark (book_id, page_index) failed with UI-safe error fields; never overwrites ready. '
  'Edge Function calls with service role; p_user_id must match book owner.';

revoke all on function public.save_page_summary_failed(uuid, integer, text, text, uuid) from public;
grant execute on function public.save_page_summary_failed(uuid, integer, text, text, uuid) to service_role;
