/** Epic 129 §16.3 — how body start was chosen (matches `books.content_start_method`). */
export type ContentStartMethod = 'heuristic' | 'llm' | 'fallback_default';

/** Epic 129 §16.3 — one-time per user per book; separate keys for smart vs fallback copy. */
export function smartStartToastStorageKey(userId: string, bookId: string): string {
  return `brivai:smartStartToast:v1:${userId}:${bookId}`;
}

export function fallbackStartToastStorageKey(userId: string, bookId: string): string {
  return `brivai:fallbackStartToast:v1:${userId}:${bookId}`;
}

export function messageForContentStartToast(
  method: ContentStartMethod,
  contentStartPageIndex: number,
): string | null {
  if (method === 'fallback_default') {
    return "We couldn't detect a chapter start for this PDF; opened at page 1.";
  }
  if (method === 'heuristic' || method === 'llm') {
    return `Opened near where the main text begins (page ${contentStartPageIndex}). You can use Previous to go back.`;
  }
  return null;
}
