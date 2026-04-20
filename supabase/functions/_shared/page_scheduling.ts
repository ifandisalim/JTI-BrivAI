/**
 * JTI-146 (Epic 129 §9): page scheduling for Mode A summarization.
 *
 * PDF pages are independent — no strict dependency order between pages.
 * We still process **pages 1–10 first** (in ascending order), then **11…N**
 * so users can start reading early while tail pages fill in the background.
 *
 * Heavy work stays server-side (Edge Functions); clients should only await
 * network I/O and keep any local loops off the UI thread (e.g. `requestIdleCallback`,
 * `InteractionManager.runAfterInteractions`, or a worker) when batching invokes.
 */

/** Inclusive upper bound of the “start reading soon” priority band (MVP README + §9). */
export const SUMMARY_PRIORITY_LAST_PAGE = 10;

/**
 * Returns 1-based page indices in **scheduling order**: 1…min(10, N), then 11…N.
 * Invalid `pageCount` yields an empty list (nothing to schedule).
 */
export function buildSummarizationPageOrder(pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return [];
  }

  const priorityEnd = Math.min(SUMMARY_PRIORITY_LAST_PAGE, pageCount);
  const out: number[] = [];
  for (let p = 1; p <= priorityEnd; p++) {
    out.push(p);
  }
  for (let p = SUMMARY_PRIORITY_LAST_PAGE + 1; p <= pageCount; p++) {
    out.push(p);
  }
  return out;
}
