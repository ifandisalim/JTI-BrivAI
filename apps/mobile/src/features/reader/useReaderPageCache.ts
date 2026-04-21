import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

import { retrySummarizePageWithExtract } from '@/src/lib/readerRetrySummarize';
import {
  fetchPageSummariesForReader,
  type PageSummaryReaderRow,
} from '@/src/lib/pageSummariesReader';

/** §10.2 reader-epic-130: soft hang if RPC has no response for this long. */
export const READER_PREFETCH_HANG_MS = 30_000;

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
  summarizeRetryError: string | null;
  prefetching: boolean;
  /** §10.2 — true after 30s prefetch with no completion; dismiss with cancelHang. */
  prefetchHangVisible: boolean;
  /** After cancel, still waiting on network — show Reload to refetch window. */
  prefetchHangDeferred: boolean;
  /** Run §4.2 window for current p (and merge). */
  prefetchForSettledPage: (p: number) => Promise<void>;
  /** §10.2 — explicit refetch after hang cancel (may overlap in-flight RPC; merges by page_index). */
  reloadPrefetchWindow: (p: number) => Promise<void>;
  /** JTI-149: extract + summarize-book-page, then refetch §4.3. */
  retryPage: (p: number) => Promise<void>;
  dismissPrefetchHang: () => void;
};

export function useReaderPageCache(
  client: SupabaseClient | null,
  bookId: string | undefined,
): UseReaderPageCacheResult {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [cache, setCache] = useState<Map<number, PageSummaryReaderRow>>(() => new Map());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [summarizeRetryError, setSummarizeRetryError] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(false);
  const [hangDismissed, setHangDismissed] = useState(false);
  const [hangElapsed, setHangElapsed] = useState(false);
  const hangTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPageCount(null);
    setCache(new Map());
    setFetchError(null);
    setSummarizeRetryError(null);
    setHangDismissed(false);
    setHangElapsed(false);
  }, [bookId]);

  useEffect(() => {
    if (hangTimerRef.current) {
      clearTimeout(hangTimerRef.current);
      hangTimerRef.current = null;
    }

    if (!prefetching) {
      setHangElapsed(false);
      setHangDismissed(false);
      return;
    }

    setHangDismissed(false);
    setHangElapsed(false);
    hangTimerRef.current = setTimeout(() => {
      setHangElapsed(true);
    }, READER_PREFETCH_HANG_MS);

    return () => {
      if (hangTimerRef.current) {
        clearTimeout(hangTimerRef.current);
        hangTimerRef.current = null;
      }
    };
  }, [prefetching]);

  const dismissPrefetchHang = useCallback(() => {
    setHangDismissed(true);
  }, []);

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

  const reloadPrefetchWindow = useCallback(
    async (p: number) => {
      setHangDismissed(false);
      await prefetchForSettledPage(p);
    },
    [prefetchForSettledPage],
  );

  const retryPage = useCallback(
    async (p: number) => {
      if (!client || !bookId) return;
      setSummarizeRetryError(null);
      inFlightRef.current += 1;
      setPrefetching(true);
      try {
        const invoke = await retrySummarizePageWithExtract(client, bookId, p);
        if (!invoke.ok) {
          setSummarizeRetryError(invoke.message);
        }
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

  const prefetchHangVisible = prefetching && hangElapsed && !hangDismissed;
  const prefetchHangDeferred = prefetching && hangDismissed;

  return useMemo(
    () => ({
      pageCount,
      cache,
      fetchError,
      summarizeRetryError,
      prefetching,
      prefetchHangVisible,
      prefetchHangDeferred,
      prefetchForSettledPage,
      reloadPrefetchWindow,
      retryPage,
      dismissPrefetchHang,
    }),
    [
      cache,
      dismissPrefetchHang,
      fetchError,
      pageCount,
      prefetchForSettledPage,
      prefetchHangDeferred,
      prefetchHangVisible,
      prefetching,
      reloadPrefetchWindow,
      retryPage,
      summarizeRetryError,
    ],
  );
}
