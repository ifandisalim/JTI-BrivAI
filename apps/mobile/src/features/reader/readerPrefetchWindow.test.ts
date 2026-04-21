import { describe, expect, it } from 'vitest';

import { getReaderPrefetchWindowIndices } from '@/src/features/reader/readerPrefetchWindow';

/**
 * reader-epic-130 §4.2 + §14 — automated guard for mandatory forward depth 3
 * (indices p..p+3 intersected with in-range pages).
 */
describe('getReaderPrefetchWindowIndices', () => {
  it('requests [p..p+3] when page count is unknown', () => {
    expect(getReaderPrefetchWindowIndices(5, null)).toEqual([5, 6, 7, 8]);
    expect(getReaderPrefetchWindowIndices(1, null)).toEqual([1, 2, 3, 4]);
  });

  it('intersects with 1..N when N is known', () => {
    expect(getReaderPrefetchWindowIndices(3, 10)).toEqual([3, 4, 5, 6]);
    expect(getReaderPrefetchWindowIndices(8, 10)).toEqual([8, 9, 10]);
    expect(getReaderPrefetchWindowIndices(10, 10)).toEqual([10]);
  });

  it('never exceeds four indices for a valid in-range p (forward depth 3)', () => {
    for (const n of [1, 5, 20, 300]) {
      for (let p = 1; p <= n; p += 1) {
        const w = getReaderPrefetchWindowIndices(p, n);
        expect(w.length).toBeLessThanOrEqual(4);
        expect(w[0]).toBe(p);
        if (w.length > 1) {
          for (let i = 1; i < w.length; i += 1) {
            expect(w[i]).toBe(w[i - 1]! + 1);
          }
        }
        const last = w[w.length - 1]!;
        expect(last).toBeLessThanOrEqual(n);
      }
    }
  });
});
