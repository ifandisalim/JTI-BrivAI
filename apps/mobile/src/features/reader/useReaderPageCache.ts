import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchPageSummariesForReader,
  type PageSummaryReaderRow,
} from '@/src/lib/pageSummariesReader';

function uniqueSortedIndices(indices: number[]): number[] {
  return [...new Set(indices)].sort((a, b) => a - b);
}

function windowIndicesFromP(p: number, pageCount: number | null): number[] {
  const start = Math.max(1, p);
  const end = pageCount === null ? start + 3 : Math.min(pageCount, start + 3);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

function mergeRows(
  prev: Map<number, PageSummaryReaderRow>,
  rows: PageSummaryReaderRow[],
): Map<number, PageSummaryReaderRow> {
  const next = new Map(prev);
  for (const row of rows) {
    next.set(row.page_index, row);
  }
  return next;
}

export type UseReaderPageCacheResult = {
  pageCount: number | null;
  cache: Map<number, PageSummaryReaderRow>;
  fetchError: string | null;
  prefetching: boolean;
  /** Run §4.2 window for current p (and merge). */
  prefetchForSettledPage: (p: number) => Promise<void>;
  /** Refetch single page (failed retry) then re-run window. */
  retryPage: (p: number) => Promise<void>;
};

export function useReaderPageCache(
  client: SupabaseClient | null,
  bookId: string | undefined,
): UseReaderPageCacheResult {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [cache, setCache] = useState<Map<number, PageSummaryReaderRow>>(() => new Map());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(false);

  useEffect(() => {
    setPageCount(null);
    setCache(new Map());
    setFetchError(null);
  }, [bookId]);

  const pageCountRef = useRef<number | null>(null);
  pageCountRef.current = pageCount;

  const inFlightRef = useRef(0);

  const runFetch = useCallback(
    async (indices: number[]): Promise<void> => {
      if (!client || !bookId || indices.length === 0) return;

      const t0 = Date.now();
      const sorted = uniqueSortedIndices(indices);
      const { data, error } = await fetchPageSummariesForReader(client, bookId, sorted);

      if (error || !data) {
        const msg = error?.message ?? 'fetch_failed';
        setFetchError(msg);
        if (__DEV__) {
          console.log('[reader] reader_prefetch_batch', {
            book_id: bookId,
            indices: sorted,
            duration_ms: Date.now() - t0,
            ok: false,
          });
        }
        return;
      }

      if (!data.ok) {
        setFetchError(data.error);
        if (__DEV__) {
          console.log('[reader] reader_prefetch_batch', {
            book_id: bookId,
            indices: sorted,
            duration_ms: Date.now() - t0,
            ok: false,
          });
        }
        return;
      }

      setFetchError(null);

      if (data.page_count !== null && data.page_count !== pageCountRef.current) {
        setPageCount(data.page_count);
      }

      setCache((prev) => {
        let next = mergeRows(prev, data.pages);
        next = mergeRows(next, data.next_page_hints);
        return next;
      });

      if (__DEV__) {
        console.log('[reader] reader_prefetch_batch', {
          book_id: bookId,
          indices: sorted,
          duration_ms: Date.now() - t0,
          ok: true,
        });
      }
    },
    [bookId, client],
  );

  const prefetchForSettledPage = useCallback(
    async (p: number) => {
      if (!client || !bookId) return;
      const pc = pageCountRef.current;
      const indices = windowIndicesFromP(p, pc);
      if (indices.length === 0) return;

      inFlightRef.current += 1;
      setPrefetching(true);
      try {
        await runFetch(indices);
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current <= 0) {
          inFlightRef.current = 0;
          setPrefetching(false);
        }
      }
    },
    [bookId, client, runFetch],
  );

  const retryPage = useCallback(
    async (p: number) => {
      if (!client || !bookId) return;
      inFlightRef.current += 1;
      setPrefetching(true);
      try {
        await runFetch([p]);
        await runFetch(windowIndicesFromP(p, pageCountRef.current));
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current <= 0) {
          inFlightRef.current = 0;
          setPrefetching(false);
        }
      }
    },
    [bookId, client, runFetch],
  );

  return useMemo(
    () => ({
      pageCount,
      cache,
      fetchError,
      prefetching,
      prefetchForSettledPage,
      retryPage,
    }),
    [cache, fetchError, pageCount, prefetchForSettledPage, prefetching, retryPage],
  );
}
