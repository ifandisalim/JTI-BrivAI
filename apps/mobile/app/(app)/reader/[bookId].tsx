import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { ReaderMarkdown } from '@/src/features/reader/ReaderMarkdown';
import { onReaderSettledPage, onReaderUnmount } from '@/src/features/reader/readingProgressStub';
import {
  READER_SWIPE_DISTANCE_PT,
  READER_SWIPE_FAIL_OFFSET_Y,
  READER_SWIPE_ACTIVE_OFFSET_X,
  READER_SWIPE_VELOCITY_PT_PER_S,
} from '@/src/features/reader/readerSwipeConstants';
import { useReaderPageCache } from '@/src/features/reader/useReaderPageCache';
import type { PageSummaryReaderRow } from '@/src/lib/pageSummariesReader';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

function parseInitialPage(raw: string | string[] | undefined): number {
  if (raw === undefined) return 1;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function pageBodyForRow(row: PageSummaryReaderRow | undefined): ReactNode {
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
            <Text style={styles.muted}>Still preparing this page…</Text>
          </View>
        );
      }
      return <ReaderMarkdown markdown={text} />;
    }
    case 'failed':
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>{row.error_message ?? 'Something went wrong summarizing this page.'}</Text>
          {row.error_code ? (
            <Text style={styles.errorCode} selectable>
              {row.error_code}
            </Text>
          ) : null}
        </View>
      );
    case 'invalid_page_index':
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>This page is outside the book.</Text>
        </View>
      );
    default:
      return null;
  }
}

export default function ReaderScreen() {
  const { bookId, page: pageParam, initialPageIndex: initialPageParam } = useLocalSearchParams<{
    bookId: string;
    page?: string;
    initialPageIndex?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const requestedInitial = useMemo(
    () => parseInitialPage(initialPageParam ?? pageParam),
    [initialPageParam, pageParam],
  );

  const client = isSupabaseConfigured() ? supabase : null;
  const { pageCount, cache, fetchError, prefetching, prefetchForSettledPage, retryPage } =
    useReaderPageCache(client, bookId);

  const [settledPage, setSettledPage] = useState(requestedInitial);
  const openedLogged = useRef(false);

  useEffect(() => {
    if (!bookId || openedLogged.current) return;
    openedLogged.current = true;
    console.log('[reader] reader_open', { book_id: bookId, initial_page: requestedInitial });
  }, [bookId, requestedInitial]);

  useEffect(() => {
    if (pageCount === null) return;
    setSettledPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (!bookId) return;
    onReaderSettledPage(bookId, settledPage);
    console.log('[reader] reader_settle_page', { book_id: bookId, page_index: settledPage });
  }, [bookId, settledPage]);

  useEffect(() => {
    return () => {
      if (bookId) {
        onReaderUnmount(bookId, settledPage);
      }
    };
  }, [bookId, settledPage]);

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

  const onTryAgain = useCallback(() => {
    void retryPage(settledPage);
  }, [retryPage, settledPage]);

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
  const showTryAgain = row?.status === 'failed';

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
            {pageBodyForRow(row)}
          </ScrollView>

          {showTryAgain ? (
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
              onPress={onTryAgain}
              disabled={prefetching}>
              <Text style={styles.retryBtnText}>{prefetching ? 'Trying…' : 'Try again'}</Text>
            </Pressable>
          ) : null}

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
  bannerText: {
    fontSize: 14,
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
  errorText: {
    fontSize: 16,
    lineHeight: 24,
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
