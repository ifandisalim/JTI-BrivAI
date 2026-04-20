import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export async function persistPageSummaryFailed(args: {
  admin: SupabaseClient;
  bookId: string;
  pageIndex: number;
  userId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<{ ok: true } | { ok: false; rpc_error: string }> {
  const { admin, bookId, pageIndex, userId, errorCode, errorMessage } = args;
  const { data, error } = await admin.rpc('save_page_summary_failed', {
    p_book_id: bookId,
    p_page_index: pageIndex,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_user_id: userId,
  });
  if (error) {
    return { ok: false, rpc_error: error.message };
  }
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const err = typeof payload?.error === 'string' ? payload.error : 'save_failed';
    return { ok: false, rpc_error: err };
  }
  return { ok: true };
}
