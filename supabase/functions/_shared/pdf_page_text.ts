/**
 * JTI-144: Extract plain text from one PDF page (text-based PDFs) for summarization.
 * Uses pdf.js for text content; pdf-lib is used elsewhere for metadata/page count only.
 */
import * as pdfjs from 'https://esm.sh/pdfjs-dist@4.8.69/build/pdf.mjs';
import { validatePdfMagicAndSize } from './pdf_limits.ts';

const PDFJS_VERSION = '4.8.69';
const WORKER_SRC =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const STANDARD_FONT_DATA_URL =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`;

let workerConfigured = false;

function ensurePdfWorker(): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  workerConfigured = true;
}

/** Collapse whitespace; trim ends (summarization-friendly). */
export function normalizeExtractedPageText(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim();
}

function unicodeLetterCount(s: string): number {
  const m = s.match(/\p{L}/gu);
  return m ? m.length : 0;
}

function unicodeDigitCount(s: string): number {
  const m = s.match(/\p{Nd}/gu);
  return m ? m.length : 0;
}

/**
 * Heuristic: scanned or image-only pages often yield empty or almost no real characters.
 * Fails closed so summarization does not run on silent garbage (JTI-144).
 */
export function isExtractedTextUsable(normalized: string): boolean {
  if (normalized.length === 0) return false;
  const letters = unicodeLetterCount(normalized);
  const digits = unicodeDigitCount(normalized);
  if (letters >= 3) return true;
  if (letters >= 1 && (letters + digits) >= 8) return true;
  if (normalized.length >= 40 && (letters + digits) >= 4) return true;
  return false;
}

export type ExtractPageTextFailure = {
  ok: false;
  error_code: string;
  error_message: string;
};

export type ExtractPageTextSuccess = { ok: true; text: string };

export type ExtractPageTextResult = ExtractPageTextFailure | ExtractPageTextSuccess;

export type ExtractPageTextArgs = {
  /** Full PDF bytes */
  bytes: Uint8Array;
  /** 1-based page index (same as PDF page labels / MVP Mode A) */
  pageIndex1Based: number;
  /** Inclusive upper bound from `books.page_count` (caller validates against DB) */
  maxPageIndex: number;
};

/**
 * Loads the PDF and returns text for `pageIndex1Based`, or a failure if magic/size invalid,
 * page out of range, parse error, empty extraction, or unusable (likely scanned) content.
 */
export async function extractTextFromPdfPage(args: ExtractPageTextArgs): Promise<ExtractPageTextResult> {
  const { bytes, pageIndex1Based, maxPageIndex } = args;

  const magic = validatePdfMagicAndSize(bytes);
  if (!magic.ok) {
    return {
      ok: false,
      error_code: magic.error_code,
      error_message: magic.error_message,
    };
  }

  if (!Number.isInteger(pageIndex1Based) || pageIndex1Based < 1) {
    return {
      ok: false,
      error_code: 'invalid_page_index',
      error_message: 'That page number is not valid for this book.',
    };
  }

  if (!Number.isInteger(maxPageIndex) || maxPageIndex < 1 || pageIndex1Based > maxPageIndex) {
    return {
      ok: false,
      error_code: 'page_out_of_range',
      error_message: 'That page is not in this PDF. Pick a page within the book.',
    };
  }

  ensurePdfWorker();

  type LoadedPdf = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  let pdf: LoadedPdf;

  try {
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      verbosity: 0,
    });
    pdf = await loadingTask.promise;
  } catch {
    return {
      ok: false,
      error_code: 'pdf_parse_failed',
      error_message:
        'We could not read this PDF for text. Try exporting the PDF again, or pick a different file.',
    };
  }

  try {
    if (pageIndex1Based > pdf.numPages) {
      return {
        ok: false,
        error_code: 'page_out_of_range',
        error_message: 'That page is not in this PDF. Pick a page within the book.',
      };
    }

    const page = await pdf.getPage(pageIndex1Based);
    const textContent = await page.getTextContent();
    const raw = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ');

    const normalized = normalizeExtractedPageText(raw);
    if (!isExtractedTextUsable(normalized)) {
      return {
        ok: false,
        error_code: 'extraction_empty',
        error_message:
          'We could not read usable text on this page. This often happens with scanned pages or image-only PDFs. The app needs text-based pages to summarise today.',
      };
    }

    return { ok: true, text: normalized };
  } catch {
    return {
      ok: false,
      error_code: 'extraction_failed',
      error_message:
        'We could not read text from this page. You can try again; if it keeps failing, this page may be image-only or scanned.',
    };
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}
