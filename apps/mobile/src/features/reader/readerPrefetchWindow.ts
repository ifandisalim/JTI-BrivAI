/**
 * reader-epic-130 §4.2 — mandatory forward window: current page plus up to three ahead.
 * Exported for unit tests asserting RPC `p_page_indices`.
 */
export function getReaderPrefetchWindowIndices(
  settledPage: number,
  pageCount: number | null,
): number[] {
  const start = Math.max(1, settledPage);
  const end =
    pageCount === null ? start + 3 : Math.min(pageCount, start + 3);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}
