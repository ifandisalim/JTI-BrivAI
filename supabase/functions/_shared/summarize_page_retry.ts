/**
 * JTI-149: shared automatic retry policy for LLM summarization (same as summarize-book-page).
 */
import { summarizePageText, type SummarizePageTextResult } from './summarize_page_text.ts';

/** Max automatic retries after the first attempt (total attempts = 1 + this value). */
export const SUMMARY_AUTO_RETRY_MAX = 3;

/** Milliseconds between attempts: index 0 after 1st fail, 1 after 2nd, … */
export const SUMMARY_RETRY_BACKOFF_MS = [250, 500, 1000] as const;

export const TRANSIENT_SUMMARY_ERROR_CODES = new Set<string>([
  'provider_error',
  'provider_rate_limited',
  'empty_model_output',
]);

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summarizePageTextWithRetries(args: {
  pageIndex: number;
  pageText: string;
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<SummarizePageTextResult> {
  let result = await summarizePageText(args);

  for (let attempt = 0; attempt < SUMMARY_AUTO_RETRY_MAX && !result.ok; attempt++) {
    if (!TRANSIENT_SUMMARY_ERROR_CODES.has(result.error_code)) break;
    const delay =
      SUMMARY_RETRY_BACKOFF_MS[attempt] ??
      SUMMARY_RETRY_BACKOFF_MS[SUMMARY_RETRY_BACKOFF_MS.length - 1];
    await sleepMs(delay);
    result = await summarizePageText(args);
  }

  return result;
}
