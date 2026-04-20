import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
import {
  extractTextFromPdfPage,
  isExtractedTextUsable,
  normalizeExtractedPageText,
} from '../_shared/pdf_page_text.ts';

Deno.test('normalizeExtractedPageText trims and collapses whitespace', () => {
  assertEquals(normalizeExtractedPageText('  hello   \n\t  world  '), 'hello world');
});

Deno.test('isExtractedTextUsable rejects empty', () => {
  assertEquals(isExtractedTextUsable(''), false);
});

Deno.test('isExtractedTextUsable accepts short word with enough letters', () => {
  assertEquals(isExtractedTextUsable('The cat sat.'), true);
});

Deno.test('isExtractedTextUsable rejects punctuation-only', () => {
  assertEquals(isExtractedTextUsable('... --- ...'), false);
});

Deno.test('extractTextFromPdfPage returns text for pdf-lib text page', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Non-fiction paragraph for extraction test.', {
    x: 50,
    y: 200,
    size: 12,
    font,
  });
  const bytes = new Uint8Array(await doc.save());
  const r = await extractTextFromPdfPage({
    bytes,
    pageIndex1Based: 1,
    maxPageIndex: 1,
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.text.includes('Non-fiction'), true);
    assertEquals(r.text.includes('extraction'), true);
  }
});

Deno.test('extractTextFromPdfPage fails page out of range', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = new Uint8Array(await doc.save());
  const r = await extractTextFromPdfPage({
    bytes,
    pageIndex1Based: 2,
    maxPageIndex: 1,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'page_out_of_range');
});

Deno.test('extractTextFromPdfPage fails not_pdf magic', async () => {
  const bytes = new TextEncoder().encode('not a pdf');
  const r = await extractTextFromPdfPage({
    bytes,
    pageIndex1Based: 1,
    maxPageIndex: 99,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'not_pdf');
});

Deno.test('extractTextFromPdfPage fails empty page (no drawable text)', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = new Uint8Array(await doc.save());
  const r = await extractTextFromPdfPage({
    bytes,
    pageIndex1Based: 1,
    maxPageIndex: 1,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'extraction_empty');
});
