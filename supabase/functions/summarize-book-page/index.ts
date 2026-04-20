/**
 * JTI-145: Server-side LLM summarization for one page of extracted text.
 * POST JSON: { page_index: number, page_text: string }
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

  let pageIndex: number;
  let pageText: string;
  try {
    const body = (await req.json()) as { page_index?: number; page_text?: unknown };
    pageIndex = typeof body.page_index === 'number' ? body.page_index : NaN;
    pageText = typeof body.page_text === 'string' ? body.page_text : '';
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    return jsonResponse({ error: 'page_index_required' }, 400);
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

  return jsonResponse({
    success: true,
    page_index: pageIndex,
    summary_text: result.summary_text,
  });
});
