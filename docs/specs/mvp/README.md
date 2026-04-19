# MVP specification index (JTI BrivAI)

This file is the **entry spec** for the MVP. **Linear issues link here** instead of carrying full technical design in the ticket body.

**Linear project:** [https://linear.app/jtienterprise/project/jti-brivai-1a409a434353/issues](https://linear.app/jtienterprise/project/jti-brivai-1a409a434353/issues)

## Frozen MVP decisions (v1.0)

- **Platform:** Android first (internal testing acceptable); iOS later.
- **Content:** PDF only; **non-fiction text PDFs** as the happy path (scanned PDFs out of scope beyond a clear error).
- **Reading mode:** **Mode A** only — **one summary unit per PDF page** (1…N). Mode B / chapter editions are post-MVP.
- **Auth:** **Fastest path** for MVP (default assumption: **Supabase magic link email** unless we explicitly change after a spike).
- **Limits:** max **50 MB** file size; max **300** PDF pages.
- **First-load summarization:** prioritize **first 10** PDF pages, then background fill.
- **Credits:** **free credits only** in MVP; **no purchases**; show a clear **out of credits** state.
- **Starter credits (default):** **50 pages** worth of summarization (meaning: enough credits to summarize **50 PDF pages** at the configured **per-page credit cost**). This must be driven by a **single documented setting** (for example one env var, one config module constant, or one Supabase settings row—pick one approach and do not scatter magic numbers).
- **Library:** **full history** of uploaded books (not “last book only”).
- **Admin:** no admin UI; operate via Supabase dashboard / SQL as needed.
- **Timeline target:** ~**2 weeks** solo build — scope cuts win over polish.

## How to use this doc with Linear

- Each **Epic** and **Issue** in Linear should include a **Spec** link pointing to a heading below (anchor), or to a future child doc (e.g. `summarization.md`) once split out.
- **Spec owns:** goals, edge cases, data model intent, API shape, sequencing, and acceptance criteria detail.
- **Linear owns:** status, priority, owner, cycle, dependencies, short **Definition of done** (testable), and a **link back** to this spec.

---

## Epic: Foundation and delivery spine

**Goal:** A working Android app shell in-repo, Supabase wired for dev/prod-ish configs, and a repeatable way to ship an internal build.

**Detailed spec (Epic 125, JTI-133, JTI-134):** [`docs/specs/mvp/foundation-epic-125.md`](foundation-epic-125.md)

---

## Epic: Authentication

**Goal:** A signed-in user session suitable for attaching credits, uploads, and per-user library state.

**Notes:** Prefer the **fastest** integrated auth for MVP; Google OAuth can be PA1 if it risks the timeline.

---

## Epic: Credits

**Goal:** Starter credits, deterministic deductions aligned to **per-page summarization**, transparent balance UX, and a hard stop when credits are exhausted.

**Starter grant (MVP default):** grant **50 pages** worth on first signup, implemented as **credits = 50 × per_page_credit_cost** (if per-page cost is 1 credit, that is simply **50 credits**—but keep the “pages” meaning explicit in naming and docs so changing economics later does not confuse you).

**Settings rule:** `STARTER_FREE_PAGES` (name can vary) lives in **one place** alongside `CREDITS_PER_SUMMARIZED_PAGE` (or equivalent). Admin UI is still out of scope; “settings” means **developer-controlled configuration**, not an in-app settings screen—unless you explicitly add one later.

---

## Epic: PDF upload and validation

**Goal:** Select a PDF, upload reliably, validate type/size/pages, and create a durable “book” record for downstream processing.

---

## Epic: Summarization pipeline Mode A

**Goal:** Extract text per PDF page (text PDFs), summarize **page-by-page**, prioritize **pages 1–10**, background-fill the remainder, store results keyed by page index, with robust error/retry semantics.

**Risk callout:** scanned PDFs are not MVP-complete; must fail clearly.

---

## Epic: Reader UI

**Goal:** Read summaries **page-by-page** with forward/back navigation, page position, and non-blocking loading states.

---

## Epic: Library resume and history

**Goal:** Full library list of books and **resume last-read page** per book for the signed-in user.

---

## Epic: Release logging and dogfood readiness

**Goal:** Enough logging to debug uploads/summaries, plus a short dogfood checklist for 3 non-you testers on real devices.