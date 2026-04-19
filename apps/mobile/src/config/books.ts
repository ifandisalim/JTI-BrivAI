/** Private bucket for per-user PDF objects (Epic 128 / JTI-141). */
export const BOOK_PDFS_BUCKET = 'book_pdfs';

/** `books.status` values — keep aligned with `supabase/migrations` check constraint. */
export const BOOK_STATUS = {
  uploading: 'uploading',
  validating: 'validating',
  ready: 'ready',
  failed: 'failed',
} as const;

export type BookStatus = (typeof BOOK_STATUS)[keyof typeof BOOK_STATUS];

/** MVP max binary size (bytes); server re-enforces in Edge `validate-book-pdf` (JTI-142). */
export const BOOK_MAX_BYTES = 50 * 1024 * 1024;

/** MVP max PDF pages; server re-enforces in Edge `validate-book-pdf` (JTI-142). */
export const BOOK_MAX_PAGES = 300;
