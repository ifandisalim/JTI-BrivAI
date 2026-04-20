/** Re-export shared limits for Supabase Edge bundling (each function ships its own copy). */
export {
  BOOK_MAX_BYTES,
  BOOK_MAX_PAGES,
  type PdfMagicSizeResult,
  type PdfPageCountResult,
  type PdfValidationFailure,
  pageCountResult,
  validatePdfMagicAndSize,
} from '../_shared/pdf_limits.ts';
