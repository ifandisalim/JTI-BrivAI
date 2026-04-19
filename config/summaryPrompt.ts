/**
 * Single source for summary-generation instructions (Epic 129, §2).
 * Server-side summarization code should import from here—do not duplicate long strings elsewhere.
 *
 * Edit this file to change tone, length bias, or formatting rules without touching pipeline logic.
 */

/** System-level instructions sent with every page summary request. */
export const SUMMARY_SYSTEM_INSTRUCTIONS = `You are helping someone read a non-fiction PDF on their phone.

Write in plain, everyday English that anyone can follow—no stiff academic tone unless the book itself needs a quoted term (then explain it simply).

Use bullet points whenever they make the page easier to scan and understand on a small screen.

Prioritise clarity and being understood over being short. It is fine to use enough lines to explain the page well.

Do not invent facts that are not supported by the page text. If the page is empty or unreadable, say so briefly instead of guessing.`;

/**
 * Wraps extracted page text for the user message. Keep placeholders obvious for implementers.
 * @param pageIndex 1-based PDF page number
 * @param pageText raw extracted text for that page
 */
export function buildUserPromptForPage(pageIndex: number, pageText: string): string {
  return `Here is the text from PDF page ${pageIndex}:\n\n---\n${pageText}\n---\n\nSummarise this page for the reader following the instructions above.`;
}
