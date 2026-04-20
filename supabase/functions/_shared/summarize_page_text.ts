/**
 * JTI-145: Call the LLM with prompts from repo-root `config/summaryPrompt.ts`.
 * Keys stay in the Edge runtime only; this module is server-side.
 */
import {
  SUMMARY_SYSTEM_INSTRUCTIONS,
  buildUserPromptForPage,
} from '../../../config/summaryPrompt.ts';

/** Rough guard so a single request cannot blow context limits. */
export const MAX_PAGE_TEXT_CHARS = 120_000;

export type SummarizePageTextSuccess = { ok: true; summary_text: string };

export type SummarizePageTextFailure = {
  ok: false;
  error_code: string;
  error_message: string;
  http_status?: number;
};

export type SummarizePageTextResult = SummarizePageTextSuccess | SummarizePageTextFailure;

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; type?: string };
};

function trimPageText(pageText: string): string {
  return pageText.replace(/\r\n/g, '\n').trim();
}

/**
 * @param pageIndex 1-based PDF page index (for prompt context only)
 * @param pageText extracted plain text for that page
 * @param apiKey OpenAI API key (never sent to clients)
 * @param model optional override; default from env or gpt-4o-mini
 */
export async function summarizePageText(args: {
  pageIndex: number;
  pageText: string;
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<SummarizePageTextResult> {
  const { pageIndex, pageText, apiKey, model, fetchImpl = fetch } = args;

  if (!apiKey.trim()) {
    return {
      ok: false,
      error_code: 'server_misconfigured',
      error_message: 'Summarization is not configured on the server.',
      http_status: 500,
    };
  }

  const normalized = trimPageText(pageText);
  if (normalized.length === 0) {
    return {
      ok: false,
      error_code: 'page_text_empty',
      error_message: 'There is no readable text on this page to summarise.',
      http_status: 400,
    };
  }

  if (normalized.length > MAX_PAGE_TEXT_CHARS) {
    return {
      ok: false,
      error_code: 'page_text_too_large',
      error_message: 'This page has too much text to summarise in one go. Try a shorter section or another export.',
      http_status: 400,
    };
  }

  const resolvedModel =
    (model && model.trim()) ||
    (typeof Deno !== 'undefined' ? (Deno.env.get('OPENAI_SUMMARY_MODEL')?.trim() ?? '') : '') ||
    'gpt-4o-mini';

  const userContent = buildUserPromptForPage(pageIndex, normalized);

  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: resolvedModel,
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_INSTRUCTIONS },
        { role: 'user', content: userContent },
      ],
    }),
  });

  const raw = await res.text();
  let parsed: OpenAiChatResponse;
  try {
    parsed = JSON.parse(raw) as OpenAiChatResponse;
  } catch {
    return {
      ok: false,
      error_code: 'provider_error',
      error_message: 'The summary service returned an unexpected response. Try again in a moment.',
      http_status: 502,
    };
  }

  if (!res.ok) {
    const msg = parsed.error?.message ?? '';
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error_code: 'provider_auth_failed',
        error_message: 'The summary service could not authorise this request.',
        http_status: 502,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error_code: 'provider_rate_limited',
        error_message: 'Too many summary requests right now. Please wait a short time and try again.',
        http_status: 503,
      };
    }
    return {
      ok: false,
      error_code: 'provider_error',
      error_message:
        res.status >= 500
          ? 'The summary service is temporarily unavailable. Try again in a moment.'
          : 'We could not summarise this page. Try again in a moment.',
      http_status: 502,
    };
  }

  const content = parsed.choices?.[0]?.message?.content;
  const summary = typeof content === 'string' ? content.trim() : '';
  if (!summary) {
    return {
      ok: false,
      error_code: 'empty_model_output',
      error_message: 'The summary came back empty. Try again.',
      http_status: 502,
    };
  }

  return { ok: true, summary_text: summary };
}
