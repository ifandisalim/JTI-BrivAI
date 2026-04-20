/**
 * JTI-142 / JTI-143: Server-authoritative PDF validation after Storage upload.
 * Downloads the object with the service role, checks magic bytes + size, parses page count (pdf-lib),
 * then drives `books.status`: `uploading` | `validating` → `ready` or `failed` (see `pdf-upload-epic-128.md` §9.2).
 * Summarization may be triggered from DB/webhooks later (§9.3); this function only finalizes validation.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { type PdfValidationFailure, validatePdfMagicAndSize, pageCountResult } from './pdf_limits.ts';

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

async function failBook(
  admin: SupabaseClient,
  bookId: string,
  userId: string,
  failure: PdfValidationFailure,
): Promise<void> {
  await admin
    .from('books')
    .update({
      status: 'failed',
      error_code: failure.error_code,
      error_message: failure.error_message,
    })
    .eq('id', bookId)
    .eq('user_id', userId);
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

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'invalid_authorization' }, 401);
  }
  const userId = userData.user.id;

  let bookId: string;
  try {
    const body = (await req.json()) as { book_id?: string };
    bookId = typeof body.book_id === 'string' ? body.book_id.trim() : '';
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  if (!bookId) {
    return jsonResponse({ error: 'book_id_required' }, 400);
  }

  const { data: book, error: bookErr } = await admin
    .from('books')
    .select('id,user_id,storage_bucket,storage_path,status,page_count,byte_size,error_code,error_message')
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle();

  if (bookErr || !book) {
    return jsonResponse({ error: 'book_not_found' }, 404);
  }

  if (book.status === 'ready') {
    return jsonResponse({
      success: true,
      page_count: book.page_count,
      byte_size: book.byte_size,
    });
  }

  if (book.status === 'failed') {
    return jsonResponse({
      success: false,
      error_code: typeof book.error_code === 'string' && book.error_code.length > 0
        ? book.error_code
        : 'failed',
      error_message: typeof book.error_message === 'string' && book.error_message.length > 0
        ? book.error_message
        : 'This import did not finish. Pick the PDF again from the library.',
    });
  }

  if (book.status !== 'uploading' && book.status !== 'validating') {
    return jsonResponse({ error: 'invalid_book_state' }, 409);
  }

  await admin
    .from('books')
    .update({ status: 'validating', error_code: null, error_message: null })
    .eq('id', bookId)
    .eq('user_id', userId);

  const { data: file, error: dlErr } = await admin.storage
    .from(book.storage_bucket)
    .download(book.storage_path);

  if (dlErr || !file) {
    const msg =
      'We could not read your uploaded file. Try uploading again, or pick a different PDF if the problem continues.';
    await failBook(admin, bookId, userId, {
      ok: false,
      error_code: 'storage_read_failed',
      error_message: msg,
    });
    return jsonResponse({
      success: false,
      error_code: 'storage_read_failed',
      error_message: msg,
    });
  }

  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);

  const magicSize = validatePdfMagicAndSize(bytes);
  if (!magicSize.ok) {
    await failBook(admin, bookId, userId, magicSize);
    return jsonResponse({
      success: false,
      error_code: magicSize.error_code,
      error_message: magicSize.error_message,
    });
  }

  let pageCount: number;
  try {
    const doc = await PDFDocument.load(ab, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    const msg =
      'This file could not be read as a PDF. Choose another file, or export the PDF again from the app that created it.';
    await failBook(admin, bookId, userId, {
      ok: false,
      error_code: 'failed_validation',
      error_message: msg,
    });
    return jsonResponse({
      success: false,
      error_code: 'failed_validation',
      error_message: msg,
    });
  }

  const pages = pageCountResult(pageCount);
  if (!pages.ok) {
    await failBook(admin, bookId, userId, pages);
    return jsonResponse({
      success: false,
      error_code: pages.error_code,
      error_message: pages.error_message,
    });
  }

  const { error: upErr } = await admin
    .from('books')
    .update({
      status: 'ready',
      page_count: pages.page_count,
      byte_size: bytes.byteLength,
      error_code: null,
      error_message: null,
    })
    .eq('id', bookId)
    .eq('user_id', userId);

  if (upErr) {
    const msg = 'Something went wrong while saving validation results. Try uploading again.';
    await failBook(admin, bookId, userId, {
      ok: false,
      error_code: 'finalize_failed',
      error_message: msg,
    });
    return jsonResponse({
      success: false,
      error_code: 'finalize_failed',
      error_message: msg,
    });
  }

  return jsonResponse({
    success: true,
    page_count: pages.page_count,
    byte_size: bytes.byteLength,
  });
});
