import type { SupabaseClient } from '@supabase/supabase-js';

export type SummarizeBookPagesDrainResult =
  | { ok: true; rounds: number; stopped_reason: string | null }
  | { ok: false; message: string };

type InvokePayload = Record<string, unknown> | null;

/**
 * Calls Edge `summarize-book-pages` repeatedly until the server reports no remaining pages
 * (Epic 129 Mode A — each invocation processes up to a capped batch server-side).
 */
export async function drainSummarizeBookPagesBatches(
  client: SupabaseClient,
  bookId: string,
  options?: { maxRounds?: number },
): Promise<SummarizeBookPagesDrainResult> {
  const maxRounds = options?.maxRounds ?? 64;
  let rounds = 0;

  for (let i = 0; i < maxRounds; i++) {
    rounds += 1;
    const { data, error } = await client.functions.invoke<InvokePayload>('summarize-book-pages', {
      body: { book_id: bookId },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const d = data as InvokePayload;
    if (!d || typeof d !== 'object') {
      return { ok: false, message: 'empty_response' };
    }

    if (d.success === false) {
      const msg =
        typeof d.error_message === 'string' && d.error_message.trim().length > 0
          ? d.error_message.trim()
          : typeof d.error === 'string' && d.error.length > 0
            ? d.error
            : 'summarize_book_pages_failed';
      return { ok: false, message: msg };
    }

    const more = d.more_pages_remain === true;
    const stopped =
      typeof d.stopped_reason === 'string' && d.stopped_reason.length > 0 ? d.stopped_reason : null;

    if (stopped) {
      return { ok: true, rounds, stopped_reason: stopped };
    }
    if (!more) {
      return { ok: true, rounds, stopped_reason: null };
    }
  }

  return { ok: true, rounds: maxRounds, stopped_reason: 'max_rounds' };
}
