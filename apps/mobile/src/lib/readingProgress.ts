import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';

const KEY_PREFIX = 'brivai:lastReadPage:v1';
const DEBOUNCE_MS = 900;

export type LastReadPageRecord = { pageIndex: number; updatedAt: string };

export function lastReadPageStorageKey(userId: string, bookId: string): string {
  return `${KEY_PREFIX}:${userId}:${bookId}`;
}

type PendingKey = string;

const pending = new Map<PendingKey, LastReadPageRecord>();
const debounceTimers = new Map<PendingKey, ReturnType<typeof setTimeout>>();
let appStateListenerAttached = false;

function schedulePersist(key: PendingKey, rec: LastReadPageRecord): void {
  const prev = debounceTimers.get(key);
  if (prev !== undefined) clearTimeout(prev);
  const t = setTimeout(() => {
    debounceTimers.delete(key);
    void persistKey(key, rec);
  }, DEBOUNCE_MS);
  debounceTimers.set(key, t);
}

async function persistKey(key: PendingKey, rec: LastReadPageRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(rec));
  } catch (e) {
    if (__DEV__) {
      console.warn('[readingProgress] persist_failed', { key, message: String(e) });
    }
  }
}

function attachAppStateListenerOnce(): void {
  if (appStateListenerAttached) return;
  appStateListenerAttached = true;
  const onChange = (next: AppStateStatus) => {
    if (next === 'background' || next === 'inactive') {
      void flushAllReadingProgress();
    }
  };
  AppState.addEventListener('change', onChange);
}

export function recordSettledPage(userId: string | null, bookId: string, pageIndex: number): void {
  if (!userId || !bookId) return;
  if (!Number.isFinite(pageIndex) || pageIndex < 1) return;

  const key = lastReadPageStorageKey(userId, bookId);
  const rec: LastReadPageRecord = {
    pageIndex: Math.floor(pageIndex),
    updatedAt: new Date().toISOString(),
  };
  pending.set(key, rec);
  attachAppStateListenerOnce();
  schedulePersist(key, rec);
}

export async function flushReadingProgress(userId: string, bookId: string): Promise<void> {
  const key = lastReadPageStorageKey(userId, bookId);
  const t = debounceTimers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    debounceTimers.delete(key);
  }
  const rec = pending.get(key);
  if (!rec) return;
  pending.delete(key);
  await persistKey(key, rec);
}

export async function flushAllReadingProgress(): Promise<void> {
  const keys = [...debounceTimers.keys()];
  for (const k of keys) {
    const t = debounceTimers.get(k);
    if (t !== undefined) clearTimeout(t);
    debounceTimers.delete(k);
  }
  const toWrite = [...pending.entries()];
  pending.clear();
  await Promise.all(
    toWrite.map(([key, rec]) => persistKey(key, rec)),
  );
}

function clampPageIndex(page: number, pageCount: number | null): number {
  const p = Math.max(1, Math.floor(page));
  if (pageCount === null || !Number.isInteger(pageCount) || pageCount < 1) {
    return p;
  }
  return Math.min(p, pageCount);
}

function parseStoredRecord(raw: string | null, pageCount: number | null): number | null {
  if (raw === null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const pageIndex = (parsed as { pageIndex?: unknown }).pageIndex;
    if (typeof pageIndex !== 'number' || !Number.isFinite(pageIndex)) return null;
    return clampPageIndex(pageIndex, pageCount);
  } catch {
    return null;
  }
}

export async function readLastReadPageIndex(
  userId: string,
  bookId: string,
  pageCount: number | null,
): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(lastReadPageStorageKey(userId, bookId));
    return parseStoredRecord(raw, pageCount);
  } catch (e) {
    if (__DEV__) {
      console.warn('[readingProgress] read_failed', { bookId, message: String(e) });
    }
    return null;
  }
}

/**
 * When opening from the library (no explicit route page), last-read wins over content start **S**.
 */
export async function resolveInitialPageIndexForLibraryOpen(input: {
  userId: string;
  bookId: string;
  pageCount: number | null;
  contentStartPageIndex: number | null;
}): Promise<number> {
  const { userId, bookId, pageCount, contentStartPageIndex } = input;
  const stored = await readLastReadPageIndex(userId, bookId, pageCount);
  if (stored !== null) return stored;

  const rawS = contentStartPageIndex;
  const S =
    typeof rawS === 'number' && Number.isInteger(rawS) && rawS >= 1 ? rawS : 1;
  return clampPageIndex(S, pageCount);
}
