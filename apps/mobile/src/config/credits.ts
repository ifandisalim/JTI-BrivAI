/**
 * Developer-controlled credit economics for MVP.
 * MUST stay in sync with numeric literals in:
 * `supabase/migrations/20260419160000_credits.sql` (starter grant + per-page cost comments / trigger).
 */
export const STARTER_FREE_PAGES = 50;

/** Credits deducted per successfully summarized PDF page (Mode A). */
export const CREDITS_PER_SUMMARIZED_PAGE = 1;
