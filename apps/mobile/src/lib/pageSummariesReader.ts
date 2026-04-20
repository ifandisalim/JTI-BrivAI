import type { SupabaseClient } from '@supabase/supabase-js';

/** Must match `fetch_page_summaries_for_reader` in Supabase (JTI-148). */
export const READER_PREFETCH_MAX_BATCH = 32;

export type PageSummaryReaderStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'invalid_page_index';

export type PageSummaryReaderRow = {
  page_index: number;
  status: PageSummaryReaderStatus;
  summary_text: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string | null;
};

export type FetchPageSummariesSuccess = {
  ok: true;
  book_id: string;
  page_count: number | null;
  pages: PageSummaryReaderRow[];
  next_page_hints: PageSummaryReaderRow[];
  max_batch_size: number;
};

export type FetchPageSummariesError = {
  ok: false;
  error: string;
  max_batch_size: number;
  requested_count?: number;
};

export type FetchPageSummariesResult = FetchPageSummariesSuccess | FetchPageSummariesError;

export async function fetchPageSummariesForReader(
  client: SupabaseClient,
  bookId: string,
  pageIndices: number[],
): Promise<{ data: FetchPageSummariesResult | null; error: Error | null }> {
  const { data, error } = await client.rpc('fetch_page_summaries_for_reader', {
    p_book_id: bookId,
    p_page_indices: pageIndices,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as FetchPageSummariesResult, error: null };
}
