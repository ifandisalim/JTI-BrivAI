# Spec: Summarization pipeline — Mode A (Epic 129)

**Linear**

- Epic: **[JTI-129](https://linear.app/jtienterprise/issue/JTI-129/epic-summarization-pipeline-mode-a)** — Summarization pipeline (Mode A)  
- Issue: **[JTI-144](https://linear.app/jtienterprise/issue/JTI-144/mvp-sum-01-extract-text-per-pdf-page-for-text-based-pdfs)** — Extract text per PDF page (text-based PDFs)  
- Issue: **[JTI-145](https://linear.app/jtienterprise/issue/JTI-145/mvp-sum-02-server-side-llm-summarization-for-a-single-page-baseline-prompt)** — Server-side LLM summarization (baseline prompt)  
- Issue: **[JTI-146](https://linear.app/jtienterprise/issue/JTI-146/mvp-sum-03-prioritize-pages-1-10-then-background-fill-remaining-pages)** — Prioritize pages 1–10, then background-fill  
- Issue: **[JTI-147](https://linear.app/jtienterprise/issue/JTI-147/mvp-sum-04-persist-per-page-summaries-keyed-by-bookid-pageindex)** — Persist per-page summaries `(bookId, pageIndex)`  
- Issue: **[JTI-148](https://linear.app/jtienterprise/issue/JTI-148/mvp-sum-05-reader-prefetch-api-contract-fetch-page-summary-next-pages)** — Reader prefetch / fetch API contract  
- Issue: **[JTI-149](https://linear.app/jtienterprise/issue/JTI-149/mvp-sum-06-per-page-failure-retry-and-non-poisoning-errors)** — Per-page failure, retry, non-poisoning errors  
- Issue: **[JTI-157](https://linear.app/jtienterprise/issue/JTI-157/mvp-sum-07-content-start-detection-hybrid-bookscontent-start-page)** — Content start detection (hybrid) + `books.content_start_page_index`  
- Issue: **[JTI-158](https://linear.app/jtienterprise/issue/JTI-158/mvp-sum-08-priority-window-ss9-tail-fill-libraryreader-default-toast)** — Priority window **S…S+9**, tail fill + library/reader default + toast

**Purpose**

This document is the **implementation-grade** spec for **Mode A**: one summary unit per **original PDF page** (1…N). The pipeline **extracts text** per page (text-PDF happy path), **summarizes on the server**, **detects body start** **`S`** per book (see §15–16) and **prioritizes the first batch** **S…min(S+9, N)** (replaces “physical pages 1–10” as the priority window), **fills the rest in the background** (pages **before `S`** and **after `S+9`**), **persists** results per `(book_id, page_index)`, **charges credits** only for successful summarization (see Epic 127), and handles **failures and retries** without corrupting good pages.

**Dependencies**

- **Epic 128:** `books` row + PDF in **private** Storage, validation passed (`ready` or equivalent).  
- **Epic 127:** `consume_credit` RPC + idempotency + ledger (per-page charge on success only).  
- **Epic 126:** RLS scoped to `auth.uid()`.  
- **Frozen MVP:** `docs/specs/mvp/README.md` (first **readable batch** anchored at body start **S…S+9**, max 300 pages, text PDF happy path, scanned handled clearly at failure).

---

## 1. Normative MVP behaviour (do not drift)


| Rule                                                                        | Source              |
| --------------------------------------------------------------------------- | ------------------- |
| One summary unit per **PDF page index** 1…N                                 | Mode A              |
| **Prioritize** summarization for **`S`…`min(S+9, N)`** (body-anchored “first 10”) before other indices | §15–16 + MVP README |
| **Body start `S`:** stored on **`books.content_start_page_index`**, **1…N** | §15 (JTI-157)       |
| **Credits:** charge **per successfully summarized page** only               | Epic 127 + README   |
| **Scanned / no extractable text:** fail **clearly**; do not pretend success | README + §1.5 row 6 |


---

## 1.5 Product intent — user experience (confirmed)

These choices are **normative for UX copy and flows** for summarization and for how the reader consumes in-progress work (reader-only polish may land in Epic 130, but **data and messaging contracts** start here).


| #   | Topic                                 | Decision                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **While summarizing (first batch)**   | **Short full-screen (or full-bleed) “getting summaries ready”** experience while the **first priority batch (`S`…`min(S+9, N)`)** is being prepared; after that, work continues **in the background** without blocking the whole app on a single modal for the entire book.                  |
| 2   | **Reader before all pages are ready** | User can **read any page that already has a successful summary**; pages **not ready yet** show a **calm, plain-English “still preparing this page”** state (not a scary error, not a blank hole).                                                                                     |
| 3   | **One bad page**                      | **Automatic retries** happen first (server-side, bounded). If retries are exhausted, that page shows a **clear error** and a **“Try again”** (or equivalent) for **that page only**; other pages stay usable.                                                                         |
| 4   | **Out of credits mid-book**           | **Stop scheduling new pages** once credits are insufficient; user can still read **pages already summarized**. Messaging matches existing **out of credits** patterns from the library/credits work (no purchases in MVP).                                                            |
| 5   | **Summary style (MVP)**               | **Single fixed style** for everyone (no “summary type” picker in MVP). Summaries use **plain, everyday English**, **easy to read on a phone**, with **point form as the default shape** when it improves **clarity**—**clarity and being understood beat being short**.               |
| 6   | **Scanned / unreadable PDF**          | When the pipeline **cannot obtain usable text for a page** (especially early pages), show a **clear, kind explanation** that this PDF is not usable **like a text book** in the app today, and **do not** keep burning credits on hopeless automatic retries for the same stuck page. |
| 7   | **Trust copy during summarization**   | **No extra trust / AI disclaimer line** in the summarization flow for MVP (beyond whatever global app patterns you already have).                                                                                                                                                     |


---

## 1.6 Design references (`resources/`)

**Visual (PNG):** `resources/BrivAI designs/`

- Use `**Section 1.png`**, `**Section 2.png**`, and `**Frame 1000002389.png**` as references for **density, typography, spacing, and progress/list** patterns when implementing **loading**, **progress**, and **book list** states that appear while summarization is in flight.  
- Match `**docs/specs/mvp/README.md` → UI design fidelity (`resources/`)**; name intentional UI deviations in the PR.

**Product / layout (PDF):** `resources/BrivAI Features/Core Summarization/`

- `**2) Summary Reader.pdf`** — reader-facing summary layout and flow expectations.  
- `**3) E-Book Reader Functionality.pdf**` — page-by-page reading behaviour.  
- `**5) Detailed summary prompt.pdf**` — inspiration for **depth and clarity** of summaries (MVP uses **one** fixed prompt profile, not multiple user-selectable types).

**Out of scope for MVP (do not implement from PDF alone):** `**4) Adjustable Summary Type.pdf`** — conflicts with **single fixed style** for MVP; treat as **post-MVP** unless README frozen scope changes.

---

## 2. Developer prompt configuration (normative)

**Goal:** Prompts and style rules live in **one place** in the repo so **developers can change wording later** without hunting through handlers.

**Canonical file:** `config/summaryPrompt.ts` at the **repository root** (folder `config/`). A **starter** module is already committed—replace or extend the strings there as product wording evolves.

- Export at least:  
  - `**SUMMARY_SYSTEM_INSTRUCTIONS`** — stable system-level instructions (plain English, point-form preference, clarity over brevity, mobile reading).  
  - `**buildUserPromptForPage(pageIndex, pageText)**` or a **template string pattern** documented in the same file — how page text is wrapped for the model.
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

1. A **worker** (or Edge pipeline) notices a `book` in **ready-for-summarization** state (exact column name from Epic 128) **and** **`books.content_start_page_index`** is already set (JTI-157 / §15.3 — **do not enqueue** summarization until **`S`** exists).
2. For each page index in order, **schedule** the **priority window** **`S`…`min(S+9, N)`** before other indices; then background-fill **1…S−1** and **S+10…N** (JTI-146 + JTI-158).
3. **Extract** text for page *n* (JTI-144); if unusable, mark page failed with user-safe messaging (§1.5 row 6).
4. **Summarize** server-side using `config/summaryPrompt.ts` (JTI-145).
5. On **successful** summary, **persist** row keyed by `(book_id, page_index)` (JTI-147) and **charge** exactly **one** logical page credit via `consume_credit` with a **stable idempotency key** for that page (e.g. `summary_charge:{book_id}:{page_index}` — exact format documented in code).
6. Expose **read API** (Supabase table, RPC, or Edge) for the client to **fetch** summary + status, optionally batched (JTI-148).
7. On transient failures, **retry** with backoff caps (JTI-149); on permanent failure, store error for UI retry.

---

## 4. Data model intent (normative minimum)

Implementers choose table names, but the **concepts** are required:

**Per-page summary storage (example name `page_summaries`):**


| Concept                        | Notes                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| `book_id`                      | FK to `books`.                                                              |
| `page_index`                   | 1-based integer matching PDF page.                                          |
| `status`                       | At least: `pending`, `processing`, `ready`, `failed` (exact enum optional). |
| `summary_text`                 | Nullable until `ready`.                                                     |
| `error_code` / `error_message` | Nullable; user-safe message for `failed`.                                   |
| `updated_at`                   | For polling / “stale” detection.                                            |


**Uniqueness:** `unique (book_id, page_index)` for summary rows.

**RLS:** only the owning user (via `book.user_id`) can read their rows; writes from **client** may be **disallowed** entirely if only server writes—preferred.

**Book-level status (optional but recommended):** extend `books` with coarse flags (`summarization_status`) *or* derive from page rows—pick one and document. Reader epic may depend on this.

---

## 5. Credit charging (ties to Epic 127)

- **Charge only** when a page transitions to `**ready`** with a persisted summary and the charge has not already been applied (idempotent key).  
- **Do not charge** for pages that end `**failed`** without a user-acceptable summary.  
- If `consume_credit` returns **insufficient credits**, **stop scheduling** new pages; leave existing `ready` pages unchanged (§1.5 row 4).

---



## 6. Epic JTI-129 — overall acceptance criteria

Epic 129 is complete when **all** of the following are true:

1. For a representative **text PDF** within MVP limits, the **priority window** **`S`…`min(S+9, N)`** becomes **readable summaries** before the remaining pages in typical runs (JTI-146 / JTI-157 / JTI-158).
2. Each summarized page is **persisted** at `(book_id, page_index)` and survives app restart (JTI-147).
3. **Credits** match Epic 127 rules: **no double charge** on retry; **no charge** on hopeless failure paths defined in JTI-149.
4. **Scanned / empty text** fails with a **clear, plain-English** outcome (§1.5 row 6).
5. **Prompts** live in `**config/summaryPrompt.ts`** and server code **imports** them (§2).
6. **User experience** matches **§1.5** rows 1–7.
7. **Design fidelity:** loading / list / progress patterns align with **§1.6**; deviations listed in PRs.

---



## 7. JTI-144 — Extract text per PDF page (text PDFs)

### 7.1 Goal

Turn page *n* of a **text-based** PDF into a string suitable for summarization.

### 7.2 Definition of done (testable)

- On sample non-fiction text PDFs, **most** pages yield non-empty sensible text.  
- Empty or garbage extraction for a page feeds the **failure** path (not silent “empty summary”).  
- Performance acceptable for MVP on **pages 1–10** on mid-range Android (document rough expectations in PR if needed).

---



## 8. JTI-145 — Server-side LLM summarization (baseline)

### 8.1 Goal

Given extracted text for page *n*, produce **summary text** matching §1.5 row 5 and §2, **without** exposing provider secrets to the client.

### 8.2 Definition of done (testable)

- Server-only API keys / provider config.  
- Output stored only via trusted write path to `page_summaries`.  
- Changing `**config/summaryPrompt.ts`** changes behaviour without editing business logic files (only import wiring at most).

---



## 9. JTI-146 — Prioritize body batch (`S`…`min(S+9, N)`), then background

### 9.1 Goal

User can start reading **near the main text** soon; remaining pages (front matter and far tail) fill in the background.

### 9.2 Definition of done (testable)

- **`S`** comes from `books.content_start_page_index` (§15–16).  
- Scheduler **prefers** indices **`S`…`min(S+9, N)`** before any other page index for that book **unless** `N < S` (invalid — should not happen if `S` is validated against `page_count`).  
- After the priority window is scheduled (or running), the worker **background-fills** **1…`S−1`** and **`min(S+10, N)`…`N`** — order between those two regions is **implementation-defined**; prefer finishing **`S+10…N`** before **`1…S−1`** when workloads tie (keeps forward reading smoother).  
- Background work **does not** freeze the UI thread on the device (all heavy work server-side or off main thread on client if any local step exists).

---



## 10. JTI-147 — Persist per-page summaries

### 10.1 Goal

Idempotent storage: re-fetch does not recreate duplicate rows or double charge.

### 10.2 Definition of done (testable)

- `unique (book_id, page_index)` enforced.  
- Re-running summarization for an already `**ready`** page does not append duplicate summaries and does not **re-charge** credits.

---



## 11. JTI-148 — Reader prefetch / fetch contract

### 11.1 Goal

Client can load **current + nearby** pages efficiently (batched or single-select).

### 11.2 Definition of done (testable)

- Documented contract: inputs (`book_id`, `page_indices[]` or range), outputs (`status`, `summary_text` nullable, `error_*` when failed).  
- **Max batch size** documented to protect payload sizes on mobile.

### 11.3 Implemented API (Supabase RPC)

**Name:** `public.fetch_page_summaries_for_reader(p_book_id uuid, p_page_indices integer[])`

**Auth:** `authenticated`; returns `not_authenticated` if `auth.uid()` is null.

**Max batch size:** **32** distinct page indices per call (MVP guard for mobile payloads; books may have up to **300** pages per frozen MVP README — prefetch in multiple calls when needed).

**Input**

| Field | Type | Rules |
| --- | --- | --- |
| `p_book_id` | `uuid` | Required; must be a book owned by the caller. |
| `p_page_indices` | `integer[]` | Non-empty; **no duplicates**; each index is **1-based** PDF page; **no null** elements. |

**Success response** (`ok: true`)

| Field | Meaning |
| --- | --- |
| `book_id` | Echo of input. |
| `page_count` | From `books.page_count` (may be `null` if unknown). |
| `pages` | Array of objects, **same order as `p_page_indices`**. |
| `next_page_hints` | Up to **3** objects for in-range pages **after** the highest valid requested index (helps prefetch “next pages” without re-specifying indices). Empty `[]` if there is no valid in-range successor (e.g. only invalid indices requested, or book ends). |
| `max_batch_size` | Always **32**. |

**Each page object** (in `pages` and `next_page_hints`)

| Field | Meaning |
| --- | --- |
| `page_index` | 1-based page number. |
| `status` | `pending` \| `processing` \| `ready` \| `failed` when a row exists or the index is in range and valid; **`invalid_page_index`** when `page_index < 1` or `page_index > page_count` (when `page_count` is set). |
| `summary_text` | Present when `ready`; otherwise `null`. |
| `error_code` / `error_message` | From `page_summaries` when `failed`; for `invalid_page_index`, `error_code` is `invalid_page_index` and `error_message` is plain English. |
| `updated_at` | From row when present; `null` for synthetic pending/invalid entries. |

**Error responses** (`ok: false`)

| `error` | When |
| --- | --- |
| `book_id_required` | `p_book_id` is null. |
| `page_indices_required` | Empty array. |
| `batch_too_large` | More than 32 indices. Response includes `max_batch_size` and `requested_count`. |
| `duplicate_page_indices` | Same page appears twice in the array. |
| `null_page_index` | Array contains a null. |
| `book_not_found` | No such book id. |
| `forbidden` | Book belongs to another user. |
| `not_authenticated` | No JWT user. |

**Client usage (TypeScript):** `apps/mobile/src/lib/pageSummariesReader.ts` exports `READER_PREFETCH_MAX_BATCH` and `fetchPageSummariesForReader(supabase, bookId, pageIndices)` wrapping this RPC.

---



## 12. JTI-149 — Per-page failure, retry, non-poisoning errors

### 12.1 Goal

One bad page **does not ruin** the whole book; automatic retries are bounded; user can retry a failed page.

### 12.2 Definition of done (testable)

- Transient errors **retry** automatically up to a documented cap with backoff.  
- Permanent errors set `**failed`** with stable `error_code` suitable for UI.  
- **“Try again”** for a failed page re-enters the pipeline **without** corrupting neighbouring `ready` pages.  
- **No credit charge** until a successful `ready` transition after retry.

**As implemented (JTI-149):**

- **Edge Function** `summarize-book-page`: up to **3** automatic retries after the first attempt (**4** tries total) for `provider_error`, `provider_rate_limited`, and `empty_model_output`; backoff **250ms → 500ms → 1000ms** between tries. Other failure codes (e.g. empty page text, provider 4xx) are **not** auto-retried (avoids burning credits on hopeless cases per §1.5 row 6 intent). OpenAI **4xx** responses (except 429) map to `provider_bad_request` (no auto-retry).
- **DB RPC** `public.save_page_summary_failed(p_book_id, p_page_index, p_error_code, p_error_message, p_user_id)` — `security definer`, **`service_role` only**; sets `failed` + clears `summary_text`; **refuses** if the row is already `ready` (no poisoning). User retry calls the same summarize path as the first attempt; credits still flow only through `save_page_summary_ready` on success.

---

<a id="jti-157"></a>

## 15. JTI-157 - Content start detection (hybrid) and `books` columns

### 15.1 Goal

For each **validated** book, choose a **1-based body start page** **`S`** so summarization and the app **skip** typical front matter (cover, copyright, TOC where possible) and **open reading** near **Chapter 1–style** content when detection succeeds.

### 15.2 Database (normative)

Migration: `supabase/migrations/20260421100000_books_content_start_jti157.sql` (or successor).

| Column | Type | Meaning |
| ------ | ---- | ------- |
| `content_start_page_index` | `integer not null` (default `1`) | **`S`**, **1…`page_count`**. Clamp against `books.page_count` when known. |
| `content_start_method` | `text not null` (default `fallback_default`) | `heuristic` \| `llm` \| `fallback_default` — how **`S`** was chosen. |

**Writes:** only **trusted server paths** (Edge Function / service role / SECURITY DEFINER with fixed `search_path`). The mobile client **must not** set these fields in normal builds; if `books` RLS allows user `update`, treat **client tampering** as out of scope for MVP beyond “honest client” assumptions.

### 15.3 Timing (**7A** — blocking before summarization)

After **`validate-book-pdf`** (or equivalent) has set `page_count` and **`books.status = ready`**, run **content-start detection** in the **same** post-validation pipeline (or immediately chained job) so that **`S`** and **`content_start_method`** are **always populated** **before** any summarization worker **enqueues** page jobs for that `book_id`.

**Do not** enqueue summarization for a book whose **`content_start_page_index`** has not yet been committed (staging envs may temporarily relax this — document).

### 15.4 Hybrid algorithm (**1C** — normative outline)

1. **Heuristics (fast path):** scan extracted text for the **first `K` pages** (`K` documented in code, e.g. **min(25, page_count)**). Use language-agnostic patterns where possible: e.g. lines matching **chapter** stems (`Chapter`, `CHAPTER`, `Ch.`), roman/arabic numbering, common **Contents** / **Acknowledgements** section headers — **scoring** pages; pick the **lowest** page index above a **confidence threshold** as candidate **`S`** with **`content_start_method = heuristic`**.

2. **LLM path (fallback from low confidence):** If heuristics are **inconclusive** below threshold, call the **LLM once per book** with a **small structured prompt** (page numbers + short text excerpts per page, capped by token budget) asking for **`S`** only (integer **1…N**), returning **`content_start_method = llm`** when accepted.

3. **Final fallback (**2B**): If still unconstrained or model invalid, set **`S = 1`**, **`content_start_method = fallback_default`**. Downstream **library/reader** show the **calm** line: readers understand we **could not** find a chapter start and **opened at page 1** (copy in §16.3).

**Note:** Exact regex lists and thresholds live in **one server module** (name in PR) so tuning does not scatter.

### 15.5 Definition of done — JTI-157 (testable)

- New columns present; existing books **backfilled** with **`S = 1`**, **`fallback_default`**.  
- Golden **fixtures** (2–3 PDFs) in CI or manual script: at least one **heuristic** hit, one **LLM** path, one **fallback_default**.  
- Summarization **does not start** until **`S`** is written for **new** uploads in real runs.

---

<a id="jti-158"></a>

## 16. JTI-158 - Priority window, library/reader default, toast

### 16.1 Scheduler (**3A**)

Implement **§9** with **`S`** from JTI-157. The **first credit-bearing batch** for UX (“getting summaries ready”) aligns with **`S`…`min(S+9, N)`**, not physical **1–10**.

### 16.2 Library default open (**5A** — with Epic 131)

When the user opens a **ready** book **and** Epic **131** has **no** AsyncStorage last-read for that `(userId, bookId)`:

- Set **`initialPageIndex = books.content_start_page_index`** (i.e. **`S`**) from the same `select` that powers the library row (or a follow-up fetch — document one approach).  
- If local last-read **exists**, it **always wins** over **`S`** (unchanged product rule).

Details: `docs/specs/mvp/library-epic-131.md` §4.2 (update alongside this spec).

### 16.3 Toast and fallback copy (**4B** + **2B**)

| Condition | UX (once per book per device unless noted) |
| --------- | --------------------------------------------- |
| `content_start_method` is **`heuristic`** or **`llm`** | **One-time** non-blocking message after open, e.g. **“Opened near where the main text begins (page S). You can use Previous to go back.”** Track **`AsyncStorage` key** `brivai:smartStartToast:v1:<userId>:<bookId>` so it does not repeat. |
| `content_start_method` is **`fallback_default`** | **One-time** calm line per **§15.4** point 3, e.g. **“We couldn’t detect a chapter start for this PDF; opened at page 1.”** Separate key pattern acceptable. |

Implementation may live in **reader shell** or **library** before navigation — pick one place and document.

### 16.4 Reader prefetch (Epic 130)

After open, **mandatory prefetch** (`reader-epic-130.md` §4) uses **`p`** as the **settled** page — typically **`S`** on first open — so prefetch windows stay consistent.

### 16.5 Definition of done — JTI-158 (testable)

- End-to-end: new upload → **`S`** set → summarization prioritizes **`S`…`min(S+9, N)`** in observed traces.  
- Library open **without** last-read lands on **`S`**.  
- Toast / fallback messages appear per table; keys prevent spam.  
- Manual QA notes for **small books** (`N` less than 10 pages) so the priority window is shorter than 10 indices.

---

## 17. Out of scope (explicit)

- **Multiple summary types** / user-selectable length modes (see `**4) Adjustable Summary Type.pdf`** — post-MVP).  
- **Trust / AI** extra copy during summarization (§1.5 row 7).  
- **Full reader UI polish** (Epic 130) — this epic still defines **data + status** the reader will consume.  
- **Perfect** chapter detection on all layouts; MVP aims for **good enough** plus **safe** fallback.

---

## 18. Suggested implementation order

1. **JTI-157** — migration + hybrid detection hooked to **post-validation** pipeline (**before** enqueue).  
2. **JTI-147** — schema + RLS + empty `pending` rows optional (or create row on first touch—document).  
3. **JTI-144** — extraction proof on one page.  
4. **JTI-145** + `**config/summaryPrompt.ts`** — one page end-to-end + credit charge.  
5. **JTI-146** / **JTI-158** — scheduler priority (`**S`…`min(S+9, N)`** tails).  
6. **JTI-148** — read/prefetch contract for app.  
7. **JTI-149** — harden failures and retries.

Order may flex with **vertical slices** (e.g. 144→145→147 before **scheduler**) as long as acceptance criteria hold. **Do not** enqueue summarization before **JTI-157** is satisfied for new books.