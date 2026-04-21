import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSummarizationPageOrder, SUMMARY_PRIORITY_BAND_PAGES } from './page_scheduling.ts';

Deno.test('buildSummarizationPageOrder: S=1 matches legacy 1-10 then tail (JTI-158 default)', () => {
  assertEquals(buildSummarizationPageOrder(1, 1), [1]);
  assertEquals(buildSummarizationPageOrder(5, 1), [1, 2, 3, 4, 5]);
  assertEquals(
    buildSummarizationPageOrder(10, 1),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assertEquals(
    buildSummarizationPageOrder(12, 1),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  const order = buildSummarizationPageOrder(300, 1);
  assertEquals(order.slice(0, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assertEquals(order[10], 11);
  assertEquals(order[order.length - 1], 300);
  assertEquals(order.length, 300);
});

Deno.test('buildSummarizationPageOrder: S=5 schedules 5-14 first, then 15..N, then 1-4', () => {
  assertEquals(
    buildSummarizationPageOrder(20, 5),
    [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 1, 2, 3, 4],
  );
});

Deno.test('buildSummarizationPageOrder: small book N<10 has a shorter priority window', () => {
  assertEquals(buildSummarizationPageOrder(3, 2), [2, 3, 1]);
  assertEquals(buildSummarizationPageOrder(5, 3), [3, 4, 5, 1, 2]);
});

Deno.test('buildSummarizationPageOrder: S out of range is clamped to 1..N', () => {
  assertEquals(
    buildSummarizationPageOrder(5, 0),
    buildSummarizationPageOrder(5, 1),
  );
  // S=99 with N=5 clamps to 5 — same as S=5: last page is the only priority page, then 1-4.
  assertEquals(
    buildSummarizationPageOrder(5, 99),
    [5, 1, 2, 3, 4],
  );
});

Deno.test('buildSummarizationPageOrder: invalid pageCount returns empty', () => {
  assertEquals(buildSummarizationPageOrder(0, 1), []);
  assertEquals(buildSummarizationPageOrder(-1, 1), []);
  assertEquals(buildSummarizationPageOrder(1.5, 1), []);
  assertEquals(buildSummarizationPageOrder(NaN, 1), []);
});

Deno.test('SUMMARY_PRIORITY_BAND_PAGES matches Epic 129 window width', () => {
  assertEquals(SUMMARY_PRIORITY_BAND_PAGES, 10);
});
