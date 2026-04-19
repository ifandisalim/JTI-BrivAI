import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BOOK_MAX_BYTES, BOOK_MAX_PAGES, pageCountResult, validatePdfMagicAndSize } from './pdf_limits.ts';

Deno.test('validatePdfMagicAndSize rejects non-PDF magic', () => {
  const bytes = new TextEncoder().encode('hello');
  const r = validatePdfMagicAndSize(bytes);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'not_pdf');
});

Deno.test('validatePdfMagicAndSize rejects over 50MB', () => {
  const head = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const bytes = new Uint8Array(BOOK_MAX_BYTES + 1);
  bytes.set(head, 0);
  const r = validatePdfMagicAndSize(bytes);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'too_large');
});

Deno.test('validatePdfMagicAndSize accepts minimal PDF header under limit', () => {
  const bytes = new Uint8Array(100);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
  const r = validatePdfMagicAndSize(bytes);
  assertEquals(r.ok, true);
});

Deno.test('pageCountResult rejects too many pages', () => {
  const r = pageCountResult(BOOK_MAX_PAGES + 1);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'too_many_pages');
});

Deno.test('pageCountResult rejects invalid page count', () => {
  const r = pageCountResult(0);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'failed_validation');
});

Deno.test('pageCountResult accepts boundary 300 pages', () => {
  const r = pageCountResult(BOOK_MAX_PAGES);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.page_count, BOOK_MAX_PAGES);
});
