import type { SupabaseClient } from '@supabase/supabase-js';

type ExtractResponse =
  | { success: true; page_index: number; text: string }
  | { success?: false; error_code?: string; error_message?: string };

type SummarizeResponse =
  | {
      success: true;
      page_index?: number;
      summary_text?: string;
      persisted?: boolean;
      already_ready?: boolean;
    }
  | {
      success?: false;
      error?: string;
      error_code?: string;
      error_message?: string;
    };

function invokeErrorMessage(err: { message?: string } | null): string {
  return err?.message ?? 'invoke_failed';
}

/**
 * JTI-149 user retry path: same summarize entrypoint as first attempt — extract page text,
 * then POST to `summarize-book-page` (Edge). Credits and poisoning rules stay server-side.
 */
export async function retrySummarizePageWithExtract(
  client: SupabaseClient,
  bookId: string,
  pageIndex: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: extractData, error: extractErr } = await client.functions.invoke<ExtractResponse>(
    'extract-book-pdf-page',
    { body: { book_id: bookId, page_index: pageIndex } },
  );

  if (extractErr) {
    return { ok: false, message: invokeErrorMessage(extractErr) };
  }

  const ex = extractData as ExtractResponse | null;
  if (!ex || ex.success !== true || typeof ex.text !== 'string') {
    const msg =
      ex && 'error_message' in ex && typeof ex.error_message === 'string'
        ? ex.error_message
        : 'Could not read text from this page.';
    return { ok: false, message: msg };
  }

  const { data: sumData, error: sumErr } = await client.functions.invoke<SummarizeResponse>(
    'summarize-book-page',
    { body: { book_id: bookId, page_index: pageIndex, page_text: ex.text } },
  );

  if (sumErr) {
    return { ok: false, message: invokeErrorMessage(sumErr) };
  }

  const sn = sumData as SummarizeResponse | null;
  if (sn && 'success' in sn && sn.success === true) {
    return { ok: true };
  }

  const failMsg =
    sn && typeof sn === 'object' && 'error_message' in sn && typeof sn.error_message === 'string'
      ? sn.error_message
      : 'Summarization did not finish. Try again.';
  return { ok: false, message: failMsg };
}
