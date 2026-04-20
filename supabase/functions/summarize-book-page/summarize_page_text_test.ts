import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MAX_PAGE_TEXT_CHARS, summarizePageText } from '../_shared/summarize_page_text.ts';

Deno.test('summarizePageText rejects empty page text', async () => {
  const r = await summarizePageText({
    pageIndex: 1,
    pageText: '   \n\t  ',
    apiKey: 'sk-test',
    fetchImpl: () => Promise.reject(new Error('fetch should not run')),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'page_text_empty');
});

Deno.test('summarizePageText rejects missing API key', async () => {
  const r = await summarizePageText({
    pageIndex: 1,
    pageText: 'Hello world this is enough letters.',
    apiKey: '',
    fetchImpl: () => Promise.reject(new Error('fetch should not run')),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'server_misconfigured');
});

Deno.test('summarizePageText rejects oversized page text', async () => {
  const r = await summarizePageText({
    pageIndex: 1,
    pageText: 'a'.repeat(MAX_PAGE_TEXT_CHARS + 1),
    apiKey: 'sk-test',
    fetchImpl: () => Promise.reject(new Error('fetch should not run')),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'page_text_too_large');
});

Deno.test('summarizePageText returns trimmed summary on success', async () => {
  const stubFetch: typeof fetch = async (input, init) => {
    assertEquals(input, 'https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    assertEquals(body.messages[0].role, 'system');
    assertEquals(body.messages[1].role, 'user');
    assertEquals(body.messages[1].content.includes('PDF page 3'), true);
    assertEquals(body.messages[1].content.includes('alpha beta'), true);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '  • Point one\n• Point two  ' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const r = await summarizePageText({
    pageIndex: 3,
    pageText: 'alpha beta gamma delta epsilon.',
    apiKey: 'sk-test',
    model: 'gpt-test',
    fetchImpl: stubFetch,
  });

  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.summary_text, '• Point one\n• Point two');
});

Deno.test('summarizePageText maps OpenAI 429 to rate limit', async () => {
  const stubFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'rate' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

  const r = await summarizePageText({
    pageIndex: 1,
    pageText: 'Enough text here for the gate. Hello world.',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    fetchImpl: stubFetch,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'provider_rate_limited');
});

Deno.test('summarizePageText maps OpenAI 4xx (non-429) to client error', async () => {
  const stubFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'bad' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const r = await summarizePageText({
    pageIndex: 1,
    pageText: 'Enough text here for the gate. Hello world.',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    fetchImpl: stubFetch,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error_code, 'provider_bad_request');
});
