import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSummarizationPageOrder, SUMMARY_PRIORITY_LAST_PAGE } from './page_scheduling.ts';

Deno.test('buildSummarizationPageOrder: N <= 10 is ascending 1..N only', () => {
  assertEquals(buildSummarizationPageOrder(1), [1]);
  assertEquals(buildSummarizationPageOrder(5), [1, 2, 3, 4, 5]);
  assertEquals(buildSummarizationPageOrder(10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

Deno.test('buildSummarizationPageOrder: N > 10 places 1-10 before tail', () => {
  assertEquals(buildSummarizationPageOrder(12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assertEquals(buildSummarizationPageOrder(11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

Deno.test('buildSummarizationPageOrder: large N keeps priority block contiguous before 11', () => {
  const order = buildSummarizationPageOrder(300);
  assertEquals(order.slice(0, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assertEquals(order[10], 11);
  assertEquals(order[order.length - 1], 300);
  assertEquals(order.length, 300);
});

Deno.test('buildSummarizationPageOrder: invalid pageCount returns empty', () => {
  assertEquals(buildSummarizationPageOrder(0), []);
  assertEquals(buildSummarizationPageOrder(-1), []);
  assertEquals(buildSummarizationPageOrder(1.5), []);
  assertEquals(buildSummarizationPageOrder(NaN), []);
});

Deno.test('SUMMARY_PRIORITY_LAST_PAGE matches MVP first-batch band', () => {
  assertEquals(SUMMARY_PRIORITY_LAST_PAGE, 10);
});
