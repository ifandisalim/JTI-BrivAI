/**
 * JTI-146 + JTI-157 (Epic 129 §9): page scheduling for Mode A summarization.
 *
 * PDF pages are independent — no strict dependency order between pages.
 * **`S`** comes from `books.content_start_page_index`. We schedule **`S…min(S+9, N)`**
 * first, then **`min(S+10, N+1)`…`N`** (tail), then **`1…S−1`** (front matter).
 *
 * Heavy work stays server-side (Edge Functions); clients should only await
 * network I/O and keep any local loops off the UI thread when batching invokes.
 */

/** Width of the body-anchored priority band (§9: first “readable batch”). */
export const SUMMARY_PRIORITY_BAND_PAGES = 10;

function clampScheduleStart(contentStartPageIndex: number, pageCount: number): number {
  if (!Number.isFinite(contentStartPageIndex)) return 1;
  const s = Math.floor(contentStartPageIndex);
  if (!Number.isInteger(pageCount) || pageCount < 1) return 1;
  return Math.min(Math.max(s, 1), pageCount);
}

/**
 * Returns 1-based page indices in **scheduling order**: `S…min(S+9, N)`, then tail, then front.
 * Invalid `pageCount` yields an empty list (nothing to schedule).
 */
export function buildSummarizationPageOrder(pageCount: number, contentStartPageIndex: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return [];
  }

  const S = clampScheduleStart(contentStartPageIndex, pageCount);
  const priorityEnd = Math.min(S + SUMMARY_PRIORITY_BAND_PAGES - 1, pageCount);

  const out: number[] = [];
  for (let p = S; p <= priorityEnd; p++) {
    out.push(p);
  }
  for (let p = priorityEnd + 1; p <= pageCount; p++) {
    out.push(p);
  }
  for (let p = 1; p <= S - 1; p++) {
    out.push(p);
  }

  return out;
}
