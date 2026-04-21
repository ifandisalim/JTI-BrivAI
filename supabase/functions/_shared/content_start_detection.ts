/**
 * JTI-157: Hybrid body start detection — heuristics on first K pages, optional one-shot LLM,
 * then S=1 with `fallback_default`. Tuning constants and patterns live here only.
 *
 * See `docs/specs/mvp/summarization-epic-129.md` §15.4.
 */
import type { LoadedPdfDocument } from './pdf_page_text.ts';
import { extractLooseTextFromLoadedPdfPage } from './pdf_page_text.ts';

/** Pages scanned from the start of the PDF (inclusive). */
export const CONTENT_START_SCAN_PAGE_COUNT_K = 25;

/** Minimum heuristic score to treat detection as confident (heuristic path). */
export const HEURISTIC_CONFIDENCE_THRESHOLD = 8;

/** Max characters of each page passed to the LLM (token budget guard). */
export const CONTENT_START_LLM_EXCERPT_CHARS = 450;

const CHAPTERISH = /\b(?:chapter|ch\.|part)\b/i;
const CHAPTER_NUMERIC = /\b(?:chapter|ch\.)\s*(?:[0-9]{1,3}|[IVXLCDM]{1,8})\b/i;
const PART_HEADER = /\bpart\s+(?:[IVXLCDM]+|[0-9]{1,2})\b/i;
const FRONT_MATTER =
  /\b(?:table of contents|contents\s*$|acknowledgements?|copyright\s*\u00a9|copyright\b|all rights reserved|isbn\b)/i;

export type ContentStartMethod = 'heuristic' | 'llm' | 'fallback_default';

export type ContentStartResult = {
  content_start_page_index: number;
  content_start_method: ContentStartMethod;
};

/**
 * Clamp S to 1…N (N = page_count).
 */
export function clampContentStartPage(s: number, pageCount: number): number {
  if (!Number.isInteger(pageCount) || pageCount < 1) return 1;
  if (!Number.isFinite(s)) return 1;
  const r = Math.floor(s);
  return Math.min(Math.max(r, 1), pageCount);
}

function previewWindow(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars);
}

/**
 * Score a single page’s text for “main body / chapter start” cues. Higher is stronger.
 */
export function scorePageForContentStart(normalizedPageText: string): number {
  const head = previewWindow(normalizedPageText, 500);
  let score = 0;

  if (CHAPTER_NUMERIC.test(head)) score += 12;
  else if (CHAPTERISH.test(head) && /[0-9IVXLCDM]/i.test(head.slice(0, 80))) score += 9;
  else if (CHAPTERISH.test(head)) score += 7;

  if (PART_HEADER.test(head)) score += 6;

  if (FRONT_MATTER.test(head.slice(0, 200))) score -= 6;

  const lower = head.toLowerCase();
  if (/\bintroduction\b/.test(lower) && head.length < 400) score += 3;

  return score;
}

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; type?: string };
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  let s = t;
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) s = fence[1].trim();

  try {
    const v = JSON.parse(s) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    const o = s.indexOf('{');
    const c = s.lastIndexOf('}');
    if (o >= 0 && c > o) {
      try {
        const v = JSON.parse(s.slice(o, c + 1)) as unknown;
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * One-shot LLM: returns 1-based S or null if unusable.
 */
async function llmInferContentStartPage(args: {
  pageCount: number;
  excerpts: Map<number, string>;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<number | null> {
  const { pageCount, excerpts, apiKey, fetchImpl = fetch } = args;
  if (!apiKey.trim()) return null;

  const k = Math.min(CONTENT_START_SCAN_PAGE_COUNT_K, pageCount);
  const lines: string[] = [`Total PDF pages (N): ${pageCount}`, '', 'Early page text (1-based indices):'];
  for (let p = 1; p <= k; p++) {
    const ex = excerpts.get(p) ?? '';
    const clip = previewWindow(ex, CONTENT_START_LLM_EXCERPT_CHARS);
    lines.push(`${p}: ${clip || '[no extractable text]'}`);
  }

  const userBlock = lines.join('\n');

  const system =
    `You locate where the main reading text of a non-fiction PDF usually begins (after cover, copyright, TOC, etc.). ` +
    `Respond with a single JSON object only, no markdown, shape: {"content_start_page": <integer>}. ` +
    `The integer must be between 1 and N inclusive, where N is the total page count given. ` +
    `Pick the 1-based page index where body chapters or the main narrative typically start (e.g. Chapter 1, Introduction with substantial text). ` +
    `If unsure, prefer an earlier plausible page over a late guess.`;

  const resolvedModel =
    (typeof Deno !== 'undefined' ? (Deno.env.get('OPENAI_SUMMARY_MODEL')?.trim() ?? '') : '') || 'gpt-4o-mini';

  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: resolvedModel,
      temperature: 0.1,
      max_tokens: 128,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: userBlock,
        },
      ],
    }),
  });

  const rawText = await res.text();
  let parsed: OpenAiChatResponse;
  try {
    parsed = JSON.parse(rawText) as OpenAiChatResponse;
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const content = parsed.choices?.[0]?.message?.content;
  const raw = typeof content === 'string' ? content.trim() : '';
  if (!raw) return null;

  const obj = parseJsonObject(raw);
  if (!obj) return null;
  const v = obj.content_start_page ?? obj.contentStartPage ?? obj.S ?? obj.s;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const page = Math.floor(n);
  if (page < 1 || page > pageCount) return null;
  return page;
}

export type DetectContentStartArgs = {
  pdf: LoadedPdfDocument;
  pageCount: number;
  /** OPENAI_API_KEY — if missing, LLM step is skipped (falls through to heuristic/fallback). */
  openaiApiKey: string;
  fetchImpl?: typeof fetch;
};

/**
 * Runs hybrid detection: heuristic → optional LLM → fallback_default with S=1.
 */
export async function detectContentStartHybrid(
  args: DetectContentStartArgs,
): Promise<ContentStartResult> {
  const { pdf, pageCount, openaiApiKey, fetchImpl } = args;

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { content_start_page_index: 1, content_start_method: 'fallback_default' };
  }

  const k = Math.min(CONTENT_START_SCAN_PAGE_COUNT_K, pageCount);
  const excerpts = new Map<number, string>();
  const scores = new Map<number, number>();

  for (let p = 1; p <= k; p++) {
    const ex = await extractLooseTextFromLoadedPdfPage({
      pdf,
      pageIndex1Based: p,
      maxPageIndex: pageCount,
    });
    const text = ex.ok ? ex.text : '';
    excerpts.set(p, text);
    scores.set(p, scorePageForContentStart(text));
  }

  let bestScore = -Infinity;
  for (const sc of scores.values()) {
    if (sc > bestScore) bestScore = sc;
  }

  let candidatePages: number[] = [];
  for (let p = 1; p <= k; p++) {
    const sc = scores.get(p) ?? 0;
    if (sc >= HEURISTIC_CONFIDENCE_THRESHOLD) candidatePages.push(p);
  }

  if (candidatePages.length > 0 && bestScore >= HEURISTIC_CONFIDENCE_THRESHOLD) {
    candidatePages.sort((a, b) => a - b);
    const s = candidatePages[0]!;
    return {
      content_start_page_index: clampContentStartPage(s, pageCount),
      content_start_method: 'heuristic',
    };
  }

  const llmPage = await llmInferContentStartPage({
    pageCount,
    excerpts,
    apiKey: openaiApiKey,
    fetchImpl,
  });
  if (llmPage !== null) {
    return {
      content_start_page_index: clampContentStartPage(llmPage, pageCount),
      content_start_method: 'llm',
    };
  }

  return {
    content_start_page_index: 1,
    content_start_method: 'fallback_default',
  };
}
