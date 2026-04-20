import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { BOOK_STATUS } from '@/src/config/books';
import { CREDITS_PER_SUMMARIZED_PAGE } from '@/src/config/credits';
import { useCreditBalance } from '@/src/hooks/useCreditBalance';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

const DEMO_BOOK_ID = 'test-book';

type LibraryBookRow = {
  id: string;
  title: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

/** Dev-only: stable key prefix so repeated taps use new idempotency keys (JTI-140 / spec §8). */
const DEV_CONSUME_KEY_PREFIX = 'dev:jti140:library:';

export default function LibraryScreen() {
  const { balance, loadState, loadError, refresh } = useCreditBalance();
  const [consumeBusy, setConsumeBusy] = useState(false);
  const [consumeMessage, setConsumeMessage] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBookRow[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setBooks([]);
      setBooksError(null);
      return;
    }
    setBooksLoading(true);
    setBooksError(null);
    const { data, error } = await supabase
      .from('books')
      .select('id, title, status, error_message, created_at')
      .order('created_at', { ascending: false });
    setBooksLoading(false);
    if (error) {
      setBooksError(error.message);
      setBooks([]);
      return;
    }
    setBooks((data ?? []) as LibraryBookRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBooks();
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
      <View style={styles.container}>
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
          <Text style={styles.errorText}>{booksError}</Text>
        ) : books.length === 0 ? (
          <Text style={styles.caption}>No books yet. Tap Add book to upload a PDF.</Text>
        ) : (
          <ScrollView style={styles.bookList} contentContainerStyle={styles.bookListContent}>
            {books.map((b) => {
              const failed = b.status === BOOK_STATUS.failed;
              // Reader is still a placeholder; opening does not spend credits (Epic 127).
              const canOpen = b.status === BOOK_STATUS.ready;
              return (
                <Pressable
                  key={b.id}
                  style={[styles.bookRow, failed && styles.bookRowFailed]}
                  disabled={!canOpen}
                  onPress={() => {
                    if (canOpen) router.push(`/reader/${b.id}`);
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
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>Developer</Text>
        <Text style={styles.caption}>Opens the reader with a hardcoded book id to verify dynamic routes.</Text>

        <Pressable
          style={[styles.button, !canSummarize && styles.buttonDisabled]}
          disabled={!canSummarize}
          onPress={() => {
            router.push(`/reader/${DEMO_BOOK_ID}`);
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    padding: 24,
    gap: 12,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
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
  bookList: {
    maxHeight: 220,
    width: '100%',
  },
  bookListContent: {
    gap: 10,
    paddingBottom: 8,
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
