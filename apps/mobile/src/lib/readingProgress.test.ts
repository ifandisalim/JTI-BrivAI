import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    getAllKeys: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  forgetLastReadForUser,
  lastReadPageStorageKey,
  onReaderSettledPage,
  readLastReadPageIndex,
  recordSettledPage,
  resolveInitialPageIndexForLibraryOpen,
} from '@/src/lib/readingProgress';

describe('readingProgress', () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.getItem).mockReset();
    vi.mocked(AsyncStorage.setItem).mockReset();
    vi.mocked(AsyncStorage.getAllKeys).mockReset();
    vi.mocked(AsyncStorage.removeItem).mockReset();
  });

  it('uses spec AsyncStorage key format', () => {
    expect(lastReadPageStorageKey('user-uuid', 'book-uuid')).toBe(
      'brivai:lastReadPage:v1:user-uuid:book-uuid',
    );
  });

  it('readLastReadPageIndex clamps to page_count when known', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ pageIndex: 99, updatedAt: '2020-01-01T00:00:00.000Z' }),
    );
    await expect(readLastReadPageIndex('u', 'b', 10)).resolves.toBe(10);
  });

  it('resolveInitialPageIndexForLibraryOpen prefers stored last-read over content start', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ pageIndex: 5, updatedAt: '2020-01-01T00:00:00.000Z' }),
    );
    const n = await resolveInitialPageIndexForLibraryOpen({
      userId: 'u',
      bookId: 'b',
      pageCount: 20,
      contentStartPageIndex: 3,
    });
    expect(n).toBe(5);
  });

  it('resolveInitialPageIndexForLibraryOpen uses content start when no local progress', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    const n = await resolveInitialPageIndexForLibraryOpen({
      userId: 'u',
      bookId: 'b',
      pageCount: 20,
      contentStartPageIndex: 7,
    });
    expect(n).toBe(7);
  });

  it('resolveInitialPageIndexForLibraryOpen defaults to page 1 when no storage and no S', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    const n = await resolveInitialPageIndexForLibraryOpen({
      userId: 'u',
      bookId: 'b',
      pageCount: null,
      contentStartPageIndex: null,
    });
    expect(n).toBe(1);
  });

  it('onReaderSettledPage is recordSettledPage (reader-epic-130 §5)', () => {
    expect(onReaderSettledPage).toBe(recordSettledPage);
  });

  it('forgetLastReadForUser removes AsyncStorage keys with user prefix', async () => {
    vi.mocked(AsyncStorage.getAllKeys).mockResolvedValue([
      'brivai:lastReadPage:v1:user-a:book-1',
      'other:key',
    ]);
    vi.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
    await forgetLastReadForUser('user-a');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      'brivai:lastReadPage:v1:user-a:book-1',
    );
  });
});
