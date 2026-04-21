import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { useAuthSession } from '@/src/auth/authSession';
import { ReaderMarkdown } from '@/src/features/reader/ReaderMarkdown';
import { flushReadingProgress, recordSettledPage } from '@/src/lib/readingProgress';
import {
  READER_SWIPE_DISTANCE_PT,
  READER_SWIPE_FAIL_OFFSET_Y,
  READER_SWIPE_ACTIVE_OFFSET_X,
  READER_SWIPE_VELOCITY_PT_PER_S,
} from '@/src/features/reader/readerSwipeConstants';
import { useReaderPageCache } from '@/src/features/reader/useReaderPageCache';
import {
  fallbackStartToastStorageKey,
  hasSeenContentStartToast,
  markContentStartToastSeen,
  messageForContentStartToast,
  smartStartToastStorageKey,
  type ContentStartMethod,
} from '@/src/lib/contentStartOpen';
import type { PageSummaryReaderRow } from '@/src/lib/pageSummariesReader';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

function parseInitialPage(raw: string | string[] | undefined): number {
  if (raw === undefined) return 1;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function pageBodyForRow(
  row: PageSummaryReaderRow | undefined,
  ctx: {
    pageCount: number | null;
    onClampToValidPage: () => void;
    onTryAgainSummarize: () => void;
    retryBusy: boolean;
    summarizeRetryFailedMessage: string | null;
  },
): ReactNode {
  if (!row) {
    return (
      <View style={styles.centerBlock}>
        <ActivityIndicator />
        <Text style={styles.muted}>Still preparing this page…</Text>
      </View>
    );
  }

  switch (row.status) {
    case 'pending':
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator />
          <Text style={styles.muted}>Still preparing this page…</Text>
        </View>
      );
    case 'processing':
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator />
          <Text style={styles.muted}>Summarizing…</Text>
        </View>
      );
    case 'ready': {
      const text = row.summary_text?.trim() ?? '';
      if (!text) {
        if (__DEV__) {
          console.warn('[reader] reader_empty_ready_page', { page_index: row.page_index });
        }
        return (
          <View style={styles.centerBlock}>
            <ActivityIndicator />
            <Text style={styles.muted}>Still preparing this page…</Text>
          </View>
        );
      }
      return <ReaderMarkdown markdown={text} />;
    }
    case 'failed':
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.failedLead}>
            {row.error_message ?? 'We could not summarize this page. You can try again.'}
          </Text>
          {row.error_code ? (
            <Text style={styles.errorCode} selectable>
              {row.error_code}
            </Text>
          ) : null}
          {ctx.summarizeRetryFailedMessage ? (
            <Text style={styles.retryInlineError}>{ctx.summarizeRetryFailedMessage}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            onPress={ctx.onTryAgainSummarize}
            disabled={ctx.retryBusy}
            accessibilityRole="button"
            accessibilityLabel="Try summarizing this page again">
            <Text style={styles.retryBtnText}>{ctx.retryBusy ? 'Trying…' : 'Try again'}</Text>
          </Pressable>
        </View>
      );
    case 'invalid_page_index':
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.failedLead}>This page is outside the book.</Text>
          <Text style={styles.muted}>
            {ctx.pageCount !== null
              ? `This book has ${ctx.pageCount} page${ctx.pageCount === 1 ? '' : 's'}.`
              : 'Wait for the book to finish loading, or open a page in range.'}
          </Text>
          {ctx.pageCount !== null ? (
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
              onPress={ctx.onClampToValidPage}
              accessibilityRole="button"
              accessibilityLabel="Go to the nearest valid page">
              <Text style={styles.secondaryBtnText}>Go to last page</Text>
            </Pressable>
          ) : null}
        </View>
      );
    default:
      return null;
  }
}

type BookOpenMeta = {
  content_start_page_index: number;
  content_start_method: ContentStartMethod;
  page_count: number | null;
};

function clampPageToBook(page: number, pageCount: number | null): number {
  if (pageCount === null || !Number.isInteger(pageCount) || pageCount < 1) {
    return Math.max(1, page);
  }
  return Math.min(Math.max(1, page), pageCount);
}

export default function ReaderScreen() {
  const { bookId, page: pageParam, initialPageIndex: initialPageParam } = useLocalSearchParams<{
    bookId: string;
    page?: string;
    initialPageIndex?: string;
  }>();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  /** True when the route supplies an explicit starting page (deep link / future callers). */
  const explicitInitial = useMemo(
    () => initialPageParam !== undefined || pageParam !== undefined,
    [initialPageParam, pageParam],
  );

  const requestedInitial = useMemo(
    () => parseInitialPage(initialPageParam ?? pageParam),
    [initialPageParam, pageParam],
  );

  const [bookOpenMeta, setBookOpenMeta] = useState<BookOpenMeta | null>(null);
  const [contentStartToast, setContentStartToast] = useState<string | null>(null);

  const client = isSupabaseConfigured() ? supabase : null;
  const {
    pageCount,
    cache,
    fetchError,
    summarizeRetryError,
    summarizeRetryBusy,
    prefetching,
    prefetchHangVisible,
    prefetchHangDeferred,
    prefetchForSettledPage,
    reloadPrefetchWindow,
    retryPage,
    dismissPrefetchHang,
  } = useReaderPageCache(client, bookId);

  const [settledPage, setSettledPage] = useState(requestedInitial);
  const openedLogged = useRef(false);
  const contentStartToastShown = useRef(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    setBookOpenMeta(null);
    setContentStartToast(null);
    contentStartToastShown.current = false;
    setSettledPage(requestedInitial);
  }, [bookId, requestedInitial]);

  useEffect(() => {
    if (!client || !bookId) {
      setBookOpenMeta(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await client
        .from('books')
        .select('content_start_page_index, content_start_method, page_count')
        .eq('id', bookId)
        .maybeSingle();

      if (cancelled || error || !data) {
        if (!cancelled && error && __DEV__) {
          console.warn('[reader] book_open_meta_fetch', { book_id: bookId, message: error.message });
        }
        return;
      }

      const rawS = data.content_start_page_index;
      const S =
        typeof rawS === 'number' && Number.isInteger(rawS) ? rawS : 1;
      const methodRaw = data.content_start_method;
      const method: ContentStartMethod =
        methodRaw === 'heuristic' || methodRaw === 'llm' || methodRaw === 'fallback_default'
          ? methodRaw
          : 'fallback_default';
      const pc = data.page_count;
      const page_count =
        typeof pc === 'number' && Number.isInteger(pc) && pc >= 1 ? pc : null;

      setBookOpenMeta({
        content_start_page_index: S,
        content_start_method: method,
        page_count,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, client]);

  useEffect(() => {
    if (!bookId || openedLogged.current) return;
    openedLogged.current = true;
    console.log('[reader] reader_open', { book_id: bookId, initial_page: requestedInitial });
  }, [bookId, requestedInitial]);

  /** Epic 129 §16.2 — without explicit `page` / `initialPageIndex`, open at **S** from `books`. */
  useEffect(() => {
    if (explicitInitial || !bookOpenMeta) return;
    const n = pageCount ?? bookOpenMeta.page_count;
    const s = clampPageToBook(bookOpenMeta.content_start_page_index, n);
    setSettledPage(s);
  }, [bookId, bookOpenMeta, explicitInitial, pageCount]);

  useEffect(() => {
    if (pageCount === null) return;
    setSettledPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  /** §16.3 — one-time toast per book per device (AsyncStorage). */
  useEffect(() => {
    if (!bookId || !userId || !bookOpenMeta || contentStartToastShown.current) return;

    const msg = messageForContentStartToast(
      bookOpenMeta.content_start_method,
      bookOpenMeta.content_start_page_index,
    );
    if (!msg) return;

    const storageKey =
      bookOpenMeta.content_start_method === 'fallback_default'
        ? fallbackStartToastStorageKey(userId, bookId)
        : smartStartToastStorageKey(userId, bookId);

    let cancelled = false;

    void (async () => {
      const seen = await hasSeenContentStartToast(storageKey);
      if (cancelled || seen) return;
      contentStartToastShown.current = true;
      setContentStartToast(msg);
      await markContentStartToastSeen(storageKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, bookOpenMeta, userId]);

  useEffect(() => {
    if (!bookId || !userId) return;
    recordSettledPage(userId, bookId, settledPage);
    console.log('[reader] reader_settle_page', { book_id: bookId, page_index: settledPage });
  }, [bookId, userId, settledPage]);

  useEffect(() => {
    return () => {
      const uid = userIdRef.current;
      if (bookId && uid) {
        void flushReadingProgress(uid, bookId);
      }
    };
  }, [bookId]);

  useEffect(() => {
    if (!client || !bookId) return;
    void prefetchForSettledPage(settledPage);
  }, [bookId, client, prefetchForSettledPage, settledPage]);

  const atFirst = settledPage <= 1;
  const atLast = pageCount !== null && settledPage >= pageCount;
  const nextKnown = pageCount !== null;

  const goPrev = useCallback(() => {
    setSettledPage((p) => Math.max(1, p - 1));
  }, []);

  const goNext = useCallback(() => {
    if (pageCount === null) return;
    setSettledPage((p) => Math.min(pageCount, p + 1));
  }, [pageCount]);

  const onTryAgainSummarize = useCallback(() => {
    void retryPage(settledPage);
  }, [retryPage, settledPage]);

  const onClampInvalidToValidPage = useCallback(() => {
    if (pageCount === null) return;
    const rowNow = cache.get(settledPage);
    if (!rowNow || rowNow.status !== 'invalid_page_index') return;
    const pi = rowNow.page_index;
    if (pi > pageCount) setSettledPage(pageCount);
    else setSettledPage(1);
  }, [cache, pageCount, settledPage]);

  const onHangReload = useCallback(() => {
    void reloadPrefetchWindow(settledPage);
  }, [reloadPrefetchWindow, settledPage]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-READER_SWIPE_ACTIVE_OFFSET_X, READER_SWIPE_ACTIVE_OFFSET_X])
        .failOffsetY([-READER_SWIPE_FAIL_OFFSET_Y, READER_SWIPE_FAIL_OFFSET_Y])
        .onEnd((e) => {
          const { translationX, velocityX } = e;
          const goLeft =
            translationX < -READER_SWIPE_DISTANCE_PT || velocityX < -READER_SWIPE_VELOCITY_PT_PER_S;
          const goRight =
            translationX > READER_SWIPE_DISTANCE_PT || velocityX > READER_SWIPE_VELOCITY_PT_PER_S;
          if (goLeft && !goRight) {
            if (pageCount === null || settledPage >= pageCount) return;
            goNext();
          } else if (goRight && !goLeft) {
            if (settledPage <= 1) return;
            goPrev();
          }
        }),
    [goNext, goPrev, pageCount, settledPage],
  );

  const row = cache.get(settledPage);

  const pageLabel =
    pageCount === null ? `Page ${settledPage}` : `Page ${settledPage} of ${pageCount}`;
  const pageIndicatorA11yLabel =
    pageCount === null
      ? `Page ${settledPage}, total pages loading`
      : `Page ${settledPage} of ${pageCount}`;

  if (!bookId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Reader' }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Text>Missing book.</Text>
        </View>
      </>
    );
  }

  if (!client) {
    return (
      <>
        <Stack.Screen options={{ title: 'Reader' }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Text>Connect Supabase to load summaries.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Reader' }} />
      <GestureDetector gesture={pan}>
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
          {fetchError ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{fetchError}</Text>
            </View>
          ) : null}

          {contentStartToast ? (
            <View style={styles.infoBanner} accessibilityRole="text">
              <Text style={styles.infoBannerText}>{contentStartToast}</Text>
            </View>
          ) : null}

          {prefetchHangVisible ? (
            <View style={styles.hangCard}>
              <Text style={styles.hangTitle}>Still loading…</Text>
              <Text style={styles.hangBody}>
                This is taking longer than usual. You can keep waiting or cancel and try again.
              </Text>
              <View style={styles.hangActions}>
                <Pressable
                  style={({ pressed }) => [styles.hangBtn, pressed && styles.hangBtnPressed]}
                  onPress={dismissPrefetchHang}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel loading wait">
                  <Text style={styles.hangBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {prefetchHangDeferred ? (
            <View style={styles.hangCardMuted}>
              <Text style={styles.hangBody}>
                Loading was slow. Tap reload to fetch this page and the next few again.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                onPress={onHangReload}
                accessibilityRole="button"
                accessibilityLabel="Reload summaries for this page">
                <Text style={styles.secondaryBtnText}>Reload</Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={styles.pageIndicator}
            accessible
            accessibilityRole="text"
            accessibilityLabel={pageIndicatorA11yLabel}>
            <Text style={styles.pageIndicatorText} importantForAccessibility="no">
              {pageLabel}
            </Text>
            {pageCount === null ? (
              <Text style={styles.subtle} importantForAccessibility="no">
                Total pages loading…
              </Text>
            ) : null}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { minHeight: width }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator>
            {pageBodyForRow(row, {
              pageCount,
              onClampToValidPage: onClampInvalidToValidPage,
              onTryAgainSummarize,
              retryBusy: summarizeRetryBusy,
              summarizeRetryFailedMessage: summarizeRetryError,
            })}
          </ScrollView>

          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [
                styles.navHit,
                atFirst && styles.navDisabled,
                pressed && !atFirst && styles.navPressed,
              ]}
              onPress={goPrev}
              disabled={atFirst}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              accessibilityHint="Go to the previous summary page"
              accessibilityState={{ disabled: atFirst }}>
              <Text style={[styles.navLabel, atFirst && styles.navLabelDisabled]}>Previous</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navHit,
                (!nextKnown || atLast) && styles.navDisabled,
                pressed && nextKnown && !atLast && styles.navPressed,
              ]}
              onPress={goNext}
              disabled={!nextKnown || atLast}
              accessibilityRole="button"
              accessibilityLabel="Next page"
              accessibilityHint="Go to the next summary page"
              accessibilityState={{ disabled: !nextKnown || atLast }}>
              <Text style={[styles.navLabel, (!nextKnown || atLast) && styles.navLabelDisabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  banner: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  hangCard: {
    backgroundColor: 'rgba(47, 149, 220, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  hangCardMuted: {
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  hangTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  hangBody: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  hangActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  hangBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(47, 149, 220, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  hangBtnPressed: {
    opacity: 0.85,
  },
  hangBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  bannerText: {
    fontSize: 14,
  },
  infoBanner: {
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  infoBannerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  pageIndicator: {
    marginBottom: 12,
  },
  pageIndicatorText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtle: {
    fontSize: 13,
    opacity: 0.65,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centerBlock: {
    gap: 12,
    paddingVertical: 24,
  },
  muted: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.75,
  },
  failedLead: {
    fontSize: 16,
    lineHeight: 24,
  },
  retryInlineError: {
    fontSize: 14,
    lineHeight: 20,
    color: '#c0392b',
    marginTop: 4,
  },
  errorCode: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    opacity: 0.7,
    marginTop: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2f95dc',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  retryBtnPressed: {
    opacity: 0.85,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(142, 142, 147, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    gap: 16,
  },
  navHit: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(47, 149, 220, 0.12)',
  },
  navPressed: {
    opacity: 0.8,
  },
  navDisabled: {
    opacity: 0.4,
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  navLabelDisabled: {
    opacity: 0.6,
  },
});
