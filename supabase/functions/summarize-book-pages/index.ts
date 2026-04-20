/**
 * JTI-146 + Epic 129 §3: Orchestrated Mode A summarization — processes multiple pages per call
 * in priority order (pages 1–10 before tail). Loads the PDF once; extract → summarize (with
 * JTI-149 retries) → persist. Stops scheduling when credits are insufficient (§1.5 row 4).
 *
 * POST JSON: { book_id: string, max_pages?: number }
 * - max_pages defaults to SUMMARIZE_BOOK_PAGES_DEFAULT_MAX; capped at SUMMARIZE_BOOK_PAGES_HARD_MAX
 *   to reduce Edge timeouts (invoke again for remaining pages).
 *
 * Requires Authorization: Bearer <user JWT>.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  destroyLoadedPdf,
  extractTextFromLoadedPdfPage,
  openPdfFromBytes,
} from '../_shared/pdf_page_text.ts';
import { buildSummarizationPageOrder } from '../_shared/page_scheduling.ts';
import { persistPageSummaryFailed } from '../_shared/persist_page_summary.ts';
import { summarizePageTextWithRetries } from '../_shared/summarize_page_retry.ts';

/** Default batch size per invocation (tune vs Edge timeout + LLM latency). */
export const SUMMARIZE_BOOK_PAGES_DEFAULT_MAX = 8;

/** Hard cap per request (client cannot exceed). */
export const SUMMARIZE_BOOK_PAGES_HARD_MAX = 15;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type PageOutcome =
  | {
      page_index: number;
      outcome: 'skipped_ready';
    }
  | {
      page_index: number;
      outcome: 'ready';
      summary_text?: string;
      credit_charged?: boolean;
      already_ready?: boolean;
    }
  | {
      page_index: number;
      outcome: 'failed';
      error_code: string;
      error_message: string;
      persisted_failure?: boolean;
    };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'invalid_authorization' }, 401);
  }
  const userId = userData.user.id;

  let bookId: string;
  let maxPagesReq: number | undefined;
  try {
    const body = (await req.json()) as { book_id?: string; max_pages?: unknown };
    bookId = typeof body.book_id === 'string' ? body.book_id.trim() : '';
    maxPagesReq =
      typeof body.max_pages === 'number' && Number.isFinite(body.max_pages)
        ? Math.floor(body.max_pages)
        : undefined;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  if (!bookId) {
    return jsonResponse({ error: 'book_id_required' }, 400);
  }

  let maxPages =
    maxPagesReq === undefined || !Number.isInteger(maxPagesReq) || maxPagesReq < 1
      ? SUMMARIZE_BOOK_PAGES_DEFAULT_MAX
      : maxPagesReq;
  maxPages = Math.min(Math.max(maxPages, 1), SUMMARIZE_BOOK_PAGES_HARD_MAX);

  const { data: book, error: bookErr } = await admin
    .from('books')
    .select('id,user_id,storage_bucket,storage_path,status,page_count')
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle();

  if (bookErr || !book) {
    return jsonResponse({ error: 'book_not_found' }, 404);
  }

  if (book.status !== 'ready') {
    return jsonResponse(
      {
        error: 'book_not_ready',
        error_message:
          book.status === 'failed'
            ? 'This import did not finish. Pick the PDF again from the library.'
            : 'This book is still being checked. Wait until the import finishes, then try again.',
      },
      409,
    );
  }

  const pageCount = typeof book.page_count === 'number' ? book.page_count : 0;
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return jsonResponse(
      {
        error: 'book_page_count_missing',
        error_message: "We could not read this book's page count yet. Try again in a moment.",
      },
      409,
    );
  }

  const { data: summaryRows, error: sumErr } = await admin
    .from('page_summaries')
    .select('page_index,status')
    .eq('book_id', bookId);

  if (sumErr) {
    return jsonResponse({ error: 'page_summary_lookup_failed' }, 500);
  }

  const statusByPage = new Map<number, string>();
  for (const row of summaryRows ?? []) {
    const pi = row.page_index as number;
    const st = row.status as string;
    if (Number.isInteger(pi)) statusByPage.set(pi, st);
  }

  const scheduleOrder = buildSummarizationPageOrder(pageCount);
  const pagesToDo: number[] = [];
  for (const p of scheduleOrder) {
    const st = statusByPage.get(p);
    if (st === 'ready') continue;
    pagesToDo.push(p);
    if (pagesToDo.length >= maxPages) break;
  }

  const totalRemaining = scheduleOrder.filter((p) => statusByPage.get(p) !== 'ready').length;

  if (pagesToDo.length === 0) {
    return jsonResponse({
      success: true,
      book_id: bookId,
      page_count: pageCount,
      outcomes: [] as PageOutcome[],
      pages_scheduled: 0,
      pages_processed: 0,
      stopped_reason: null,
      more_pages_remain: totalRemaining > 0,
      total_pages_not_ready: totalRemaining,
    });
  }

  const { data: file, error: dlErr } = await admin.storage
    .from(book.storage_bucket)
    .download(book.storage_path);

  if (dlErr || !file) {
    return jsonResponse(
      {
        success: false,
        error_code: 'storage_read_failed',
        error_message:
          'We could not read your uploaded file. Try again, or pick the PDF again from the library.',
      },
      502,
    );
  }

  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);

  const opened = await openPdfFromBytes(bytes);
  if (!opened.ok) {
    return jsonResponse(
      {
        success: false,
        error_code: opened.error_code,
        error_message: opened.error_message,
      },
      502,
    );
  }

  const pdf = opened.pdf;

  if (!anonKey) {
    await destroyLoadedPdf(pdf);
    return jsonResponse(
      {
        error: 'server_misconfigured',
        error_message: 'SUPABASE_ANON_KEY is required to persist summaries with the caller JWT.',
      },
      500,
    );
  }

  const userClient: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const outcomes: PageOutcome[] = [];
  let stoppedReason: 'insufficient_credits' | null = null;
  let lastBalance: number | undefined;

  try {
    for (const pageIndex of pagesToDo) {
      if (stoppedReason) break;

      const extract = await extractTextFromLoadedPdfPage({
        pdf,
        pageIndex1Based: pageIndex,
        maxPageIndex: pageCount,
      });

      if (!extract.ok) {
        const persist = await persistPageSummaryFailed({
          admin,
          bookId,
          pageIndex,
          userId,
          errorCode: extract.error_code,
          errorMessage: extract.error_message,
        });
        if (!persist.ok && persist.rpc_error === 'unexpected_ready') {
          statusByPage.set(pageIndex, 'ready');
          outcomes.push({ page_index: pageIndex, outcome: 'skipped_ready' });
          continue;
        }
        if (!persist.ok) {
          outcomes.push({
            page_index: pageIndex,
            outcome: 'failed',
            error_code: extract.error_code,
            error_message: extract.error_message,
            persisted_failure: false,
          });
          continue;
        }
        statusByPage.set(pageIndex, 'failed');
        outcomes.push({
          page_index: pageIndex,
          outcome: 'failed',
          error_code: extract.error_code,
          error_message: extract.error_message,
          persisted_failure: true,
        });
        continue;
      }

      const sumResult = await summarizePageTextWithRetries({
        pageIndex,
        pageText: extract.text,
        apiKey: openaiKey,
      });

      if (!sumResult.ok) {
        const persist = await persistPageSummaryFailed({
          admin,
          bookId,
          pageIndex,
          userId,
          errorCode: sumResult.error_code,
          errorMessage: sumResult.error_message,
        });
        if (!persist.ok && persist.rpc_error === 'unexpected_ready') {
          statusByPage.set(pageIndex, 'ready');
          outcomes.push({ page_index: pageIndex, outcome: 'skipped_ready' });
          continue;
        }
        if (!persist.ok) {
          outcomes.push({
            page_index: pageIndex,
            outcome: 'failed',
            error_code: sumResult.error_code,
            error_message: sumResult.error_message,
            persisted_failure: false,
          });
          continue;
        }
        statusByPage.set(pageIndex, 'failed');
        outcomes.push({
          page_index: pageIndex,
          outcome: 'failed',
          error_code: sumResult.error_code,
          error_message: sumResult.error_message,
          persisted_failure: true,
        });
        continue;
      }

      const { data: saveData, error: saveErr } = await userClient.rpc('save_page_summary_ready', {
        p_book_id: bookId,
        p_page_index: pageIndex,
        p_summary_text: sumResult.summary_text,
      });

      if (saveErr) {
        outcomes.push({
          page_index: pageIndex,
          outcome: 'failed',
          error_code: 'persist_failed',
          error_message: saveErr.message,
          persisted_failure: false,
        });
        continue;
      }

      const payload = saveData as Record<string, unknown> | null;
      if (!payload || payload.ok !== true) {
        const err = typeof payload?.error === 'string' ? payload.error : 'save_failed';
        const balanceRaw = payload?.credit_balance;
        const balance =
          typeof balanceRaw === 'number'
            ? balanceRaw
            : typeof balanceRaw === 'string'
              ? Number(balanceRaw)
              : undefined;
        if (typeof balance === 'number' && Number.isFinite(balance)) {
          lastBalance = balance;
        }

        if (err === 'insufficient_credits') {
          stoppedReason = 'insufficient_credits';
          outcomes.push({
            page_index: pageIndex,
            outcome: 'failed',
            error_code: err,
            error_message: 'You do not have enough credits to save this summary.',
            persisted_failure: false,
          });
          break;
        }

        outcomes.push({
          page_index: pageIndex,
          outcome: 'failed',
          error_code: err,
          error_message: 'Could not save this summary. Try again.',
          persisted_failure: false,
        });
        continue;
      }

      const summaryText =
        typeof payload.summary_text === 'string' ? payload.summary_text : sumResult.summary_text;
      const balRaw = payload.credit_balance;
      if (typeof balRaw === 'number' && Number.isFinite(balRaw)) {
        lastBalance = balRaw;
      }

      outcomes.push({
        page_index: pageIndex,
        outcome: 'ready',
        summary_text: summaryText,
        credit_charged: payload.credit_charged === true,
        already_ready: payload.already_ready === true,
      });

      statusByPage.set(pageIndex, 'ready');
    }
  } finally {
    await destroyLoadedPdf(pdf);
  }

  const notReadyAfter = scheduleOrder.filter((p) => statusByPage.get(p) !== 'ready').length;

  return jsonResponse({
    success: true,
    book_id: bookId,
    page_count: pageCount,
    outcomes,
    pages_scheduled: pagesToDo.length,
    pages_processed: outcomes.length,
    stopped_reason: stoppedReason,
    credit_balance: lastBalance,
    more_pages_remain: notReadyAfter > 0,
    total_pages_not_ready: notReadyAfter,
    max_pages_per_invocation: SUMMARIZE_BOOK_PAGES_HARD_MAX,
  });
});
