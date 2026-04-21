import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuthSession } from '@/src/auth/authSession';
import { BOOK_STATUS } from '@/src/config/books';
import { CREDITS_PER_SUMMARIZED_PAGE } from '@/src/config/credits';
import { useCreditBalance } from '@/src/hooks/useCreditBalance';
import { resolveInitialPageIndexForLibraryOpen } from '@/src/lib/readingProgress';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

const DEMO_BOOK_ID = 'test-book';

type LibraryBookRow = {
  id: string;
  title: string;
  status: string;
  error_message: string | null;
  created_at: string;
  page_count: number | null;
  content_start_page_index: number | null;
  content_start_method: string | null;
};

/** library-epic-131 §2 sort 4C + §3.1 — title asc, tie-break `created_at` desc. */
function sortLibraryBooks(rows: LibraryBookRow[]): LibraryBookRow[] {
  return [...rows].sort((a, b) => {
    const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Dev-only: stable key prefix so repeated taps use new idempotency keys (JTI-140 / spec §8). */
const DEV_CONSUME_KEY_PREFIX = 'dev:jti140:library:';

type LoadBooksReason = 'focus' | 'pull';

export default function LibraryScreen() {
  const { session } = useAuthSession();
  const { balance, loadState, loadError, refresh } = useCreditBalance();
  const [consumeBusy, setConsumeBusy] = useState(false);
  const [consumeMessage, setConsumeMessage] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBookRow[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksRefreshing, setBooksRefreshing] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const booksCountRef = useRef(0);

  const loadBooks = useCallback(async (reason: LoadBooksReason = 'focus') => {
    if (!isSupabaseConfigured() || !supabase) {
      booksCountRef.current = 0;
      setBooks([]);
      setBooksError(null);
      setBooksLoading(false);
      setBooksRefreshing(false);
      return;
    }

    const hadBooks = booksCountRef.current > 0;
    const showBlockingSpinner = reason === 'focus' && !hadBooks;
    if (reason === 'pull') {
      setBooksRefreshing(true);
    } else if (showBlockingSpinner) {
      setBooksLoading(true);
      setBooksError(null);
    }
    // Focus revisit with data already shown: silent refetch (no RefreshControl spinner).

    const { data, error } = await supabase
      .from('books')
      .select(
        'id, title, status, error_message, created_at, page_count, content_start_page_index, content_start_method',
      );

    setBooksLoading(false);
    setBooksRefreshing(false);

    if (error) {
      setBooksError(error.message);
      setBooks((prev) => {
        if (prev.length === 0) {
          booksCountRef.current = 0;
          return [];
        }
        return prev;
      });
      return;
    }

    setBooksError(null);
    const sorted = sortLibraryBooks((data ?? []) as LibraryBookRow[]);
    booksCountRef.current = sorted.length;
    setBooks(sorted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBooks('focus');
    }, [loadBooks]),
  );

  const onSignOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/sign-in');
  }, []);

  const canSummarize =
    loadState === 'ready' && balance !== null && balance >= CREDITS_PER_SUMMARIZED_PAGE;

  const onDevConsumeTestCredit = useCallback(async () => {
    if (!__DEV__ || !isSupabaseConfigured() || !supabase) return;

    setConsumeBusy(true);
    setConsumeMessage(null);

    const key = `${DEV_CONSUME_KEY_PREFIX}${Date.now()}`;
    const { data, error } = await supabase.rpc('consume_credit', {
      p_idempotency_key: key,
      p_cost: CREDITS_PER_SUMMARIZED_PAGE,
    });

    setConsumeBusy(false);

    if (error) {
      setConsumeMessage(error.message);
      return;
    }

    const payload = data as { ok?: boolean; error?: string; balance?: number; charged?: boolean } | null;
    if (payload?.ok === false) {
      setConsumeMessage(
        payload.error === 'insufficient_credits'
          ? 'Out of credits (server confirmed).'
          : `Could not use credit: ${String(payload.error ?? 'unknown')}`,
      );
    } else if (payload?.ok === true) {
      setConsumeMessage(
        payload.charged
          ? `Test charge applied. Balance: ${String(payload.balance ?? '—')}.`
          : 'No charge (idempotent replay).',
      );
    } else {
      setConsumeMessage('Unexpected response from server.');
    }

    await refresh();
  }, [refresh]);

  const onBooksRefresh = useCallback(() => {
    void loadBooks('pull');
  }, [loadBooks]);

  const balanceLabel =
    loadState === 'loading' || loadState === 'idle' ? (
      <View style={styles.balanceRow}>
        <ActivityIndicator />
        <Text style={styles.balanceCaption}>Loading credits…</Text>
      </View>
    ) : loadState === 'error' ? (
      <Text style={styles.errorText}>{loadError ?? 'Could not load credits.'}</Text>
    ) : balance === null ? (
      <Text style={styles.errorText}>Credits unavailable.</Text>
    ) : (
      <Text style={styles.balanceText}>
        Credits: <Text style={styles.balanceNumber}>{balance}</Text>
      </Text>
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Library',
          headerRight: () => (
            <Pressable onPress={() => void onSignOut()} hitSlop={12} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={booksRefreshing} onRefresh={onBooksRefresh} />
          }>
          <View style={styles.creditsBanner}>
            {balanceLabel}
            {!canSummarize && loadState === 'ready' && balance !== null && (
              <Text style={styles.outOfCredits}>
                You are out of credits. Summarizing is blocked until you have at least{' '}
                {CREDITS_PER_SUMMARIZED_PAGE} credit
                {CREDITS_PER_SUMMARIZED_PAGE === 1 ? '' : 's'}.
              </Text>
            )}
          </View>

          <Pressable style={styles.addBookButton} onPress={() => router.push('/upload-pdf')}>
            <Text style={styles.addBookButtonText}>Add book</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Your books</Text>
          {booksLoading ? (
            <View style={styles.booksLoadingRow}>
              <ActivityIndicator />
              <Text style={styles.caption}>Loading books…</Text>
            </View>
          ) : booksError ? (
            <View style={styles.booksErrorBlock}>
              <Text style={styles.errorText}>{booksError}</Text>
              <Pressable style={styles.retryButton} onPress={onBooksRefresh}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : books.length === 0 ? (
            <View style={styles.emptyBooks}>
              <Text style={styles.caption}>No books yet. Upload a PDF to see it here.</Text>
              <Pressable style={styles.emptyAddLink} onPress={() => router.push('/upload-pdf')}>
                <Text style={styles.emptyAddLinkText}>Add book</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.bookList}>
              {books.map((b) => {
                const failed = b.status === BOOK_STATUS.failed;
                const canOpen = b.status === BOOK_STATUS.ready;
                return (
                  <Pressable
                    key={b.id}
                    style={[
                      styles.bookRow,
                      failed && styles.bookRowFailed,
                      !canOpen && styles.bookRowNotReady,
                    ]}
                    disabled={!canOpen}
                    onPress={() => {
                      if (!canOpen) return;
                      const uid = session?.user?.id;
                      void (async () => {
                        const initial =
                          uid !== undefined
                            ? await resolveInitialPageIndexForLibraryOpen({
                                userId: uid,
                                bookId: b.id,
                                pageCount: b.page_count,
                                contentStartPageIndex: b.content_start_page_index,
                              })
                            : 1;
                        router.push({
                          pathname: '/reader/[bookId]',
                          params: { bookId: b.id, initialPageIndex: String(initial) },
                        });
                      })();
                    }}>
                    <Text style={styles.bookTitle} numberOfLines={2}>
                      {b.title}
                    </Text>
                    <Text style={styles.bookMeta}>
                      {failed
                        ? 'Failed'
                        : b.status === BOOK_STATUS.uploading
                          ? 'Uploading'
                          : b.status === BOOK_STATUS.validating
                            ? 'Checking PDF'
                            : b.status === BOOK_STATUS.ready
                              ? 'Ready'
                              : b.status}
                    </Text>
                    {failed && b.error_message ? (
                      <Text style={styles.bookError} numberOfLines={3}>
                        {b.error_message}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionTitle}>Developer</Text>
          <Text style={styles.caption}>
            Opens the reader with a hardcoded book id to verify dynamic routes.
          </Text>

          <Pressable
            style={[styles.button, !canSummarize && styles.buttonDisabled]}
            disabled={!canSummarize}
            onPress={() => {
              const uid = session?.user?.id;
              void (async () => {
                const initial =
                  uid !== undefined
                    ? await resolveInitialPageIndexForLibraryOpen({
                        userId: uid,
                        bookId: DEMO_BOOK_ID,
                        pageCount: null,
                        contentStartPageIndex: null,
                      })
                    : 1;
                router.push({
                  pathname: '/reader/[bookId]',
                  params: { bookId: DEMO_BOOK_ID, initialPageIndex: String(initial) },
                });
              })();
            }}>
            <Text style={styles.buttonText}>Open reader ({DEMO_BOOK_ID})</Text>
          </Pressable>

          {__DEV__ && isSupabaseConfigured() && supabase && (
            <View style={styles.devBlock}>
              <Text style={styles.devLabel}>Developer test (consume_credit)</Text>
              <Pressable
                style={[styles.devButton, (!canSummarize || consumeBusy) && styles.buttonDisabled]}
                disabled={!canSummarize || consumeBusy}
                onPress={() => void onDevConsumeTestCredit()}>
                <Text style={styles.devButtonText}>{consumeBusy ? 'Working…' : 'Use 1 test credit'}</Text>
              </Pressable>
              {consumeMessage ? <Text style={styles.devMessage}>{consumeMessage}</Text> : null}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 12,
    paddingBottom: 40,
  },
  creditsBanner: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    gap: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  balanceCaption: {
    fontSize: 14,
    opacity: 0.85,
  },
  balanceText: {
    fontSize: 16,
    textAlign: 'center',
  },
  balanceNumber: {
    fontWeight: '700',
    fontSize: 18,
  },
  outOfCredits: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.9,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#c0392b',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  caption: {
    fontSize: 14,
    textAlign: 'left',
    opacity: 0.8,
  },
  addBookButton: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  addBookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  booksLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  booksErrorBlock: {
    gap: 12,
    alignItems: 'stretch',
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyBooks: {
    gap: 10,
  },
  emptyAddLink: {
    alignSelf: 'flex-start',
  },
  emptyAddLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2f95dc',
  },
  bookList: {
    width: '100%',
    gap: 10,
  },
  bookRow: {
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    gap: 4,
  },
  bookRowFailed: {
    borderColor: 'rgba(192, 57, 43, 0.45)',
  },
  bookRowNotReady: {
    opacity: 0.55,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookMeta: {
    fontSize: 13,
    opacity: 0.75,
  },
  bookError: {
    fontSize: 13,
    color: '#c0392b',
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f95dc',
  },
  devBlock: {
    marginTop: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 8,
  },
  devLabel: {
    fontSize: 12,
    opacity: 0.65,
  },
  devButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#555',
  },
  devButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  devMessage: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.85,
  },
});
