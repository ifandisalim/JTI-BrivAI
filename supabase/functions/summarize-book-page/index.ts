/**
 * JTI-145 + JTI-147: Summarize one page of extracted text and persist at (book_id, page_index).
 * POST JSON: { book_id: string, page_index: number, page_text: string }
 * Credit idempotency key (Epic 129 §3): summary_charge:{book_id}:{page_index} (see save_page_summary_ready in DB).
 * Requires Authorization: Bearer <user JWT>. API keys stay in Edge secrets only.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { summarizePageText } from '../_shared/summarize_page_text.ts';

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

  let bookId: string;
  let pageIndex: number;
  let pageText: string;
  try {
    const body = (await req.json()) as {
      book_id?: string;
      page_index?: number;
      page_text?: unknown;
    };
    bookId = typeof body.book_id === 'string' ? body.book_id.trim() : '';
    pageIndex = typeof body.page_index === 'number' ? body.page_index : NaN;
    pageText = typeof body.page_text === 'string' ? body.page_text : '';
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  if (!bookId) {
    return jsonResponse({ error: 'book_id_required' }, 400);
  }

  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    return jsonResponse({ error: 'page_index_required' }, 400);
  }

  const { data: book, error: bookErr } = await admin
    .from('books')
    .select('id,user_id,status')
    .eq('id', bookId)
    .eq('user_id', userData.user.id)
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

  const { data: existingRow, error: existingErr } = await admin
    .from('page_summaries')
    .select('status,summary_text')
    .eq('book_id', bookId)
    .eq('page_index', pageIndex)
    .maybeSingle();

  if (existingErr) {
    return jsonResponse({ error: 'page_summary_lookup_failed' }, 500);
  }

  if (existingRow?.status === 'ready' && typeof existingRow.summary_text === 'string') {
    return jsonResponse({
      success: true,
      page_index: pageIndex,
      summary_text: existingRow.summary_text,
      persisted: true,
      already_ready: true,
      credit_charged: false,
    });
  }

  const result = await summarizePageText({
    pageIndex,
    pageText,
    apiKey: openaiKey,
  });

  if (!result.ok) {
    return jsonResponse(
      {
        success: false,
        error_code: result.error_code,
        error_message: result.error_message,
      },
      result.http_status ?? 500,
    );
  }

  if (!anonKey) {
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

  const { data: saveData, error: saveErr } = await userClient.rpc('save_page_summary_ready', {
    p_book_id: bookId,
    p_page_index: pageIndex,
    p_summary_text: result.summary_text,
  });

  if (saveErr) {
    return jsonResponse(
      { error: 'persist_failed', error_message: saveErr.message },
      500,
    );
  }

  const payload = saveData as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const err = typeof payload?.error === 'string' ? payload.error : 'save_failed';
    const balance = payload?.credit_balance;
    const status = err === 'insufficient_credits' ? 402 : 400;
    return jsonResponse(
      {
        success: false,
        error_code: err,
        error_message:
          err === 'insufficient_credits'
            ? 'You do not have enough credits to save this summary.'
            : 'Could not save this summary. Try again.',
        ...(typeof balance === 'number' ? { credit_balance: balance } : {}),
      },
      status,
    );
  }

  return jsonResponse({
    success: true,
    page_index: pageIndex,
    summary_text: typeof payload.summary_text === 'string' ? payload.summary_text : result.summary_text,
    persisted: true,
    already_ready: payload.already_ready === true,
    credit_charged: payload.credit_charged === true,
    credit_balance: typeof payload.credit_balance === 'number' ? payload.credit_balance : undefined,
  });
});
