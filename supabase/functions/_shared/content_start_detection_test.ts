import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  HEURISTIC_CONFIDENCE_THRESHOLD,
  clampContentStartPage,
  detectContentStartHybrid,
  scorePageForContentStart,
} from './content_start_detection.ts';
import { openPdfFromBytes } from './pdf_page_text.ts';

Deno.test('clampContentStartPage clamps to 1..N', () => {
  assertEquals(clampContentStartPage(5, 10), 5);
  assertEquals(clampContentStartPage(-3, 10), 1);
  assertEquals(clampContentStartPage(99, 10), 10);
  assertEquals(clampContentStartPage(NaN, 10), 1);
});

Deno.test('scorePageForContentStart: chapter line scores above threshold', () => {
  const s = scorePageForContentStart('Chapter 1\nSome body text here.');
  assertEquals(s >= HEURISTIC_CONFIDENCE_THRESHOLD, true);
});

Deno.test('scorePageForContentStart: plain copyright scores low', () => {
  const s = scorePageForContentStart('Copyright © 2024 Publisher. All rights reserved.');
  assertEquals(s < HEURISTIC_CONFIDENCE_THRESHOLD, true);
});

Deno.test('detectContentStartHybrid: low heuristic + mock LLM returns llm path', async () => {
  const minimalPdf = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc4, 0xe5, 0xf2, 0xe5, 0xeb, 0xa7,
    0xf3, 0xa0, 0xd0, 0xc4, 0xc6, 0x0a, 0x0a,
  ]);
  const opened = await openPdfFromBytes(minimalPdf);
  if (!opened.ok) {
    return;
  }
  try {
    const fetchImpl = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"content_start_page": 3}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const r = await detectContentStartHybrid({
      pdf: opened.pdf,
      pageCount: 10,
      openaiApiKey: 'test-key',
      fetchImpl,
    });
    assertEquals(r.content_start_method, 'llm');
    assertEquals(r.content_start_page_index, 3);
  } finally {
    await opened.pdf.destroy();
  }
});
