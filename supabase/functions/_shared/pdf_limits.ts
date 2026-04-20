/** MVP limits — keep aligned with `docs/specs/mvp/README.md` and mobile `BOOK_MAX_*`. */
export const BOOK_MAX_BYTES = 50 * 1024 * 1024;
export const BOOK_MAX_PAGES = 300;

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export type PdfValidationFailure = {
  ok: false;
  error_code: string;
  error_message: string;
};

export type PdfValidationSuccess = { ok: true };

export type PdfMagicSizeResult = PdfValidationFailure | PdfValidationSuccess;

export type PdfPageCountResult = PdfValidationFailure | { ok: true; page_count: number };

function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

/** Magic bytes + binary size (before pdf-lib parse). */
export function validatePdfMagicAndSize(bytes: Uint8Array): PdfMagicSizeResult {
  if (!hasPdfMagic(bytes)) {
    return {
      ok: false,
      error_code: 'not_pdf',
      error_message: 'This file is not a PDF. Choose another file that is a real PDF.',
    };
  }
  if (bytes.byteLength > BOOK_MAX_BYTES) {
    return {
      ok: false,
      error_code: 'too_large',
      error_message: 'This PDF is over 50 MB. Choose another PDF under 50 MB.',
    };
  }
  return { ok: true };
}

export function pageCountResult(pageCount: number): PdfPageCountResult {
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return {
      ok: false,
      error_code: 'failed_validation',
      error_message:
        "We could not read this PDF's page count. Try another PDF, or export it again from the app that created it.",
    };
  }
  if (pageCount > BOOK_MAX_PAGES) {
    return {
      ok: false,
      error_code: 'too_many_pages',
      error_message: 'This PDF has over 300 pages. Choose a shorter PDF (300 pages or fewer).',
    };
  }
  return { ok: true, page_count: pageCount };
}
