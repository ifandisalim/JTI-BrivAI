# Spec: Summarization pipeline — Mode A (Epic 129)

**Linear**

- Epic: **[JTI-129](https://linear.app/jtienterprise/issue/JTI-129/epic-summarization-pipeline-mode-a)** — Summarization pipeline (Mode A)  
- Issue: **[JTI-144](https://linear.app/jtienterprise/issue/JTI-144/mvp-sum-01-extract-text-per-pdf-page-for-text-based-pdfs)** — Extract text per PDF page (text-based PDFs)  
- Issue: **[JTI-145](https://linear.app/jtienterprise/issue/JTI-145/mvp-sum-02-server-side-llm-summarization-for-a-single-page-baseline-prompt)** — Server-side LLM summarization (baseline prompt)  
- Issue: **[JTI-146](https://linear.app/jtienterprise/issue/JTI-146/mvp-sum-03-prioritize-pages-1-10-then-background-fill-remaining-pages)** — Prioritize pages 1–10, then background-fill  
- Issue: **[JTI-147](https://linear.app/jtienterprise/issue/JTI-147/mvp-sum-04-persist-per-page-summaries-keyed-by-bookid-pageindex)** — Persist per-page summaries `(bookId, pageIndex)`  
- Issue: **[JTI-148](https://linear.app/jtienterprise/issue/JTI-148/mvp-sum-05-reader-prefetch-api-contract-fetch-page-summary-next-pages)** — Reader prefetch / fetch API contract  
- Issue: **[JTI-149](https://linear.app/jtienterprise/issue/JTI-149/mvp-sum-06-per-page-failure-retry-and-non-poisoning-errors)** — Per-page failure, retry, non-poisoning errors  

**Purpose**

This document is the **implementation-grade** spec for **Mode A**: one summary unit per **original PDF page** (1…N). The pipeline **extracts text** per page (text-PDF happy path), **summarizes on the server**, **prioritizes pages 1–10**, **fills the rest in the background**, **persists** results per `(book_id, page_index)`, **charges credits** only for successful summarization (see Epic 127), and handles **failures and retries** without corrupting good pages.

**Dependencies**

- **Epic 128:** `books` row + PDF in **private** Storage, validation passed (`ready` or equivalent).  
- **Epic 127:** `consume_credit` RPC + idempotency + ledger (per-page charge on success only).  
- **Epic 126:** RLS scoped to `auth.uid()`.  
- **Frozen MVP:** `docs/specs/mvp/README.md` (first 10 pages first, max 300 pages, text PDF happy path, scanned handled clearly at failure).

---

## 1. Normative MVP behaviour (do not drift)

| Rule | Source |
|------|--------|
| One summary unit per **PDF page index** 1…N | Mode A |
| **Prioritize** summarization for **pages 1–10** before tail pages | MVP README |
| **Credits:** charge **per successfully summarized page** only | Epic 127 + README |
| **Scanned / no extractable text:** fail **clearly**; do not pretend success | README + §1.5 row 6 |

---

## 1.5 Product intent — user experience (confirmed)

These choices are **normative for UX copy and flows** for summarization and for how the reader consumes in-progress work (reader-only polish may land in Epic 130, but **data and messaging contracts** start here).

| # | Topic | Decision |
|---|--------|----------|
| 1 | **While summarizing (first batch)** | **Short full-screen (or full-bleed) “getting summaries ready”** experience while the **first priority batch (pages 1–10)** is being prepared; after that, work continues **in the background** without blocking the whole app on a single modal for the entire book. |
| 2 | **Reader before all pages are ready** | User can **read any page that already has a successful summary**; pages **not ready yet** show a **calm, plain-English “still preparing this page”** state (not a scary error, not a blank hole). |
| 3 | **One bad page** | **Automatic retries** happen first (server-side, bounded). If retries are exhausted, that page shows a **clear error** and a **“Try again”** (or equivalent) for **that page only**; other pages stay usable. |
| 4 | **Out of credits mid-book** | **Stop scheduling new pages** once credits are insufficient; user can still read **pages already summarized**. Messaging matches existing **out of credits** patterns from the library/credits work (no purchases in MVP). |
| 5 | **Summary style (MVP)** | **Single fixed style** for everyone (no “summary type” picker in MVP). Summaries use **plain, everyday English**, **easy to read on a phone**, with **point form as the default shape** when it improves **clarity**—**clarity and being understood beat being short**. |
| 6 | **Scanned / unreadable PDF** | When the pipeline **cannot obtain usable text for a page** (especially early pages), show a **clear, kind explanation** that this PDF is not usable **like a text book** in the app today, and **do not** keep burning credits on hopeless automatic retries for the same stuck page. |
| 7 | **Trust copy during summarization** | **No extra trust / AI disclaimer line** in the summarization flow for MVP (beyond whatever global app patterns you already have). |

---

## 1.6 Design references (`resources/`)

**Visual (PNG):** `resources/BrivAI designs/`

- Use **`Section 1.png`**, **`Section 2.png`**, and **`Frame 1000002389.png`** as references for **density, typography, spacing, and progress/list** patterns when implementing **loading**, **progress**, and **book list** states that appear while summarization is in flight.  
- Match **`docs/specs/mvp/README.md` → UI design fidelity (`resources/`)**; name intentional UI deviations in the PR.

**Product / layout (PDF):** `resources/BrivAI Features/Core Summarization/`

- **`2) Summary Reader.pdf`** — reader-facing summary layout and flow expectations.  
- **`3) E-Book Reader Functionality.pdf`** — page-by-page reading behaviour.  
- **`5) Detailed summary prompt.pdf`** — inspiration for **depth and clarity** of summaries (MVP uses **one** fixed prompt profile, not multiple user-selectable types).  

**Out of scope for MVP (do not implement from PDF alone):** **`4) Adjustable Summary Type.pdf`** — conflicts with **single fixed style** for MVP; treat as **post-MVP** unless README frozen scope changes.

---

## 2. Developer prompt configuration (normative)

**Goal:** Prompts and style rules live in **one place** in the repo so **developers can change wording later** without hunting through handlers.

**Canonical file:** `config/summaryPrompt.ts` at the **repository root** (folder `config/`). A **starter** module is already committed—replace or extend the strings there as product wording evolves.

- Export at least:  
  - **`SUMMARY_SYSTEM_INSTRUCTIONS`** — stable system-level instructions (plain English, point-form preference, clarity over brevity, mobile reading).  
  - **`buildUserPromptForPage(pageIndex, pageText)`** or a **template string pattern** documented in the same file — how page text is wrapped for the model.  
- The **server-side summarization entrypoint** (Edge Function, worker, or RPC-invoked module) **must import** these exports (or a generated copy **only if** build pipeline keeps them identical—prefer a **single file**).  
- **Do not** embed long prompt strings ad hoc in random server files.  
- **Do not** ship this file inside the **mobile client bundle** as the source of truth for production prompts if that would leak or fork prompts—**server** remains authoritative; the `config/` file is the **versioned source** the server build uses.

**Style rules (must be reflected in `SUMMARY_SYSTEM_INSTRUCTIONS`):**

- Use **plain, everyday English** anyone can follow.  
- Prefer **bullet points** when they make the summary **easier to scan and understand** on a phone.  
- Prefer **clear and well understood** over **short** when those trade off.  
- Avoid stiff jargon unless the book introduces it; then explain briefly in simple words.

---

## 3. High-level pipeline (target end state)

1. A **worker** (or Edge pipeline) notices a `book` in **ready-for-summarization** state (exact column name from Epic 128).  
2. For each page index in order, **schedule** pages **1–10** before lower-priority tail pages (JTI-146).  
3. **Extract** text for page *n* (JTI-144); if unusable, mark page failed with user-safe messaging (§1.5 row 6).  
4. **Summarize** server-side using `config/summaryPrompt.ts` (JTI-145).  
5. On **successful** summary, **persist** row keyed by `(book_id, page_index)` (JTI-147) and **charge** exactly **one** logical page credit via `consume_credit` with a **stable idempotency key** for that page (e.g. `summary_charge:{book_id}:{page_index}` — exact format documented in code).  
6. Expose **read API** (Supabase table, RPC, or Edge) for the client to **fetch** summary + status, optionally batched (JTI-148).  
7. On transient failures, **retry** with backoff caps (JTI-149); on permanent failure, store error for UI retry.

---

## 4. Data model intent (normative minimum)

Implementers choose table names, but the **concepts** are required:

**Per-page summary storage (example name `page_summaries`):**

| Concept | Notes |
|--------|--------|
| `book_id` | FK to `books`. |
| `page_index` | 1-based integer matching PDF page. |
| `status` | At least: `pending`, `processing`, `ready`, `failed` (exact enum optional). |
| `summary_text` | Nullable until `ready`. |
| `error_code` / `error_message` | Nullable; user-safe message for `failed`. |
| `updated_at` | For polling / “stale” detection. |

**Uniqueness:** `unique (book_id, page_index)` for summary rows.

**RLS:** only the owning user (via `book.user_id`) can read their rows; writes from **client** may be **disallowed** entirely if only server writes—preferred.

**Book-level status (optional but recommended):** extend `books` with coarse flags (`summarization_status`) *or* derive from page rows—pick one and document. Reader epic may depend on this.

---

## 5. Credit charging (ties to Epic 127)

- **Charge only** when a page transitions to **`ready`** with a persisted summary and the charge has not already been applied (idempotent key).  
- **Do not charge** for pages that end **`failed`** without a user-acceptable summary.  
- If `consume_credit` returns **insufficient credits**, **stop scheduling** new pages; leave existing `ready` pages unchanged (§1.5 row 4).

---

<a id="jti-129"></a>

## 6. Epic JTI-129 — overall acceptance criteria

Epic 129 is complete when **all** of the following are true:

1. For a representative **text PDF** within MVP limits, **pages 1–10** become **readable summaries** before the tail pages in typical runs (JTI-146).  
2. Each summarized page is **persisted** at `(book_id, page_index)` and survives app restart (JTI-147).  
3. **Credits** match Epic 127 rules: **no double charge** on retry; **no charge** on hopeless failure paths defined in JTI-149.  
4. **Scanned / empty text** fails with a **clear, plain-English** outcome (§1.5 row 6).  
5. **Prompts** live in **`config/summaryPrompt.ts`** and server code **imports** them (§2).  
6. **User experience** matches **§1.5** rows 1–7.  
7. **Design fidelity:** loading / list / progress patterns align with **§1.6**; deviations listed in PRs.

---

<a id="jti-144"></a>

## 7. JTI-144 — Extract text per PDF page (text PDFs)

### 7.1 Goal

Turn page *n* of a **text-based** PDF into a string suitable for summarization.

### 7.2 Definition of done (testable)

- On sample non-fiction text PDFs, **most** pages yield non-empty sensible text.  
- Empty or garbage extraction for a page feeds the **failure** path (not silent “empty summary”).  
- Performance acceptable for MVP on **pages 1–10** on mid-range Android (document rough expectations in PR if needed).

---

<a id="jti-145"></a>

## 8. JTI-145 — Server-side LLM summarization (baseline)

### 8.1 Goal

Given extracted text for page *n*, produce **summary text** matching §1.5 row 5 and §2, **without** exposing provider secrets to the client.

### 8.2 Definition of done (testable)

- Server-only API keys / provider config.  
- Output stored only via trusted write path to `page_summaries`.  
- Changing **`config/summaryPrompt.ts`** changes behaviour without editing business logic files (only import wiring at most).

---

<a id="jti-146"></a>

## 9. JTI-146 — Prioritize pages 1–10, then background

### 9.1 Goal

User can start reading **soon**; tail pages fill while they read forward.

### 9.2 Definition of done (testable)

- Scheduler **prefers** 1–10 before starting **higher** indices except when dependencies require strict order (N/A for independent pages—document).  
- Background work **does not** freeze the UI thread on the device (all heavy work server-side or off main thread on client if any local step exists).

---

<a id="jti-147"></a>

## 10. JTI-147 — Persist per-page summaries

### 10.1 Goal

Idempotent storage: re-fetch does not recreate duplicate rows or double charge.

### 10.2 Definition of done (testable)

- `unique (book_id, page_index)` enforced.  
- Re-running summarization for an already **`ready`** page does not append duplicate summaries and does not **re-charge** credits.

---

<a id="jti-148"></a>

## 11. JTI-148 — Reader prefetch / fetch contract

### 11.1 Goal

Client can load **current + nearby** pages efficiently (batched or single-select).

### 11.2 Definition of done (testable)

- Documented contract: inputs (`book_id`, `page_indices[]` or range), outputs (`status`, `summary_text` nullable, `error_*` when failed).  
- **Max batch size** documented to protect payload sizes on mobile.

---

<a id="jti-149"></a>

## 12. JTI-149 — Per-page failure, retry, non-poisoning errors

### 12.1 Goal

One bad page **does not ruin** the whole book; automatic retries are bounded; user can retry a failed page.

### 12.2 Definition of done (testable)

- Transient errors **retry** automatically up to a documented cap with backoff.  
- Permanent errors set **`failed`** with stable `error_code` suitable for UI.  
- **“Try again”** for a failed page re-enters the pipeline **without** corrupting neighbouring `ready` pages.  
- **No credit charge** until a successful `ready` transition after retry.

---

## 13. Out of scope (explicit)

- **Multiple summary types** / user-selectable length modes (see **`4) Adjustable Summary Type.pdf`** — post-MVP).  
- **Trust / AI** extra copy during summarization (§1.5 row 7).  
- **Full reader UI polish** (Epic 130) — this epic still defines **data + status** the reader will consume.

---

## 14. Suggested implementation order

1. **JTI-147** — schema + RLS + empty `pending` rows optional (or create row on first touch—document).  
2. **JTI-144** — extraction proof on one page.  
3. **JTI-145** + **`config/summaryPrompt.ts`** — one page end-to-end + credit charge.  
4. **JTI-146** — scheduler priority.  
5. **JTI-148** — read/prefetch contract for app.  
6. **JTI-149** — harden failures and retries.

Order may flex with **vertical slices** (e.g. 144→145→147 before 146) as long as acceptance criteria hold.
