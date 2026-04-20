/**
 * JTI-144: Authenticated endpoint to extract machine-readable text from one PDF page
 * (text-PDF happy path). Empty / unusable extraction returns failure, not empty success.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { extractTextFromPdfPage } from '../_shared/pdf_page_text.ts';

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
  let pageIndex: number;
  try {
    const body = (await req.json()) as { book_id?: string; page_index?: number };
    bookId = typeof body.book_id === 'string' ? body.book_id.trim() : '';
    pageIndex = typeof body.page_index === 'number' ? body.page_index : NaN;
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

  const result = await extractTextFromPdfPage({
    bytes,
    pageIndex1Based: pageIndex,
    maxPageIndex: pageCount,
  });

  if (!result.ok) {
    return jsonResponse({
      success: false,
      error_code: result.error_code,
      error_message: result.error_message,
    });
  }

  return jsonResponse({
    success: true,
    page_index: pageIndex,
    text: result.text,
  });
});
