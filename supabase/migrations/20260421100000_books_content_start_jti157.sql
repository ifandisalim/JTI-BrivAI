-- JTI-157 / Epic 129: body start page for summarization priority + library/reader default open.
-- Hybrid detection populates these columns before summarization is scheduled (see summarization-epic-129.md).

alter table public.books
  add column if not exists content_start_page_index integer,
  add column if not exists content_start_method text;

comment on column public.books.content_start_page_index is '1-based PDF page index where body text is expected to begin (S). Used for priority batch S..S+9 and default reader open when no local last-read.';
comment on column public.books.content_start_method is 'How S was chosen: heuristic | llm | fallback_default.';

-- Backfill existing rows before NOT NULL.
update public.books
set
  content_start_page_index = coalesce(content_start_page_index, 1),
  content_start_method = coalesce(content_start_method, 'fallback_default')
where content_start_page_index is null
   or content_start_method is null;

alter table public.books
  alter column content_start_page_index set not null,
  alter column content_start_page_index set default 1;

alter table public.books
  alter column content_start_method set not null,
  alter column content_start_method set default 'fallback_default';

alter table public.books
  add constraint books_content_start_page_index_positive check (content_start_page_index >= 1);

alter table public.books
  add constraint books_content_start_method_check check (
    content_start_method in ('heuristic', 'llm', 'fallback_default')
  );
