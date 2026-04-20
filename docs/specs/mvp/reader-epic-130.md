# Spec: Reader UI (Epic 130)

**Linear**

- Epic: **[JTI-130](https://linear.app/jtienterprise/issue/JTI-130/epic-reader-ui)** — Reader UI  
- Issue: **[JTI-150](https://linear.app/jtienterprise/issue/JTI-150/mvp-rdr-01-summary-reader-ui-page-navigation-content-view)** — Summary reader UI (page navigation + content view)  
- Issue: **[JTI-151](https://linear.app/jtienterprise/issue/JTI-151/mvp-rdr-02-page-position-indicator-page-x-of-y)** — Page position indicator (“Page x of y”)  
- Issue: **[JTI-152](https://linear.app/jtienterprise/issue/JTI-152/mvp-rdr-03-loading-and-timeout-ux-for-not-ready-pages)** — Loading and timeout UX for not-ready pages  

**Purpose**

This document is the **implementation-grade** spec for the **MVP reader**: read **per-page summaries** (Mode A) with **forward/back** controls and **horizontal swipe**, a clear **page position** indicator, **Markdown** rendering for ready pages, and **per-page** loading / failure / retry UX. Sessions start **only from in-app navigation** (`bookId` + optional starting page). **Prefetch** is **mandatory** and tied to the existing **JTI-148** RPC contract.

**Dependencies**

- **Epic 129 (JTI-148):** `public.fetch_page_summaries_for_reader` + client wrapper `apps/mobile/src/lib/pageSummariesReader.ts`.  
- **Epic 129 (JTI-149):** per-page `failed` state + retry semantics the reader must surface.  
- **Epic 126:** authenticated user.  
- **Epic 131 (JTI-131):** durable **last-read page** persistence — this spec defines **when** the reader must signal “user settled on page *p*” so Epic 131 can own storage (see §5).  
- **Frozen MVP:** `docs/specs/mvp/README.md` (Android-first, Mode A, no chat UI in reader).

---

## 1. Product intent (plain English)

The user opens a book in the **summary reader** and moves **one PDF page at a time** (indices **1…N**, where **N** is the book’s page count). Each page shows either a **formatted summary** (when the server says `ready`), a **calm waiting state** (`pending` / `processing`), or a **clear failure** with a path to **retry** (`failed`, aligned with JTI-149). The user may **jump** to any in-range page; **unready** pages must never feel like a crash—only that page shows wait/error UI (normative: **§2** table, row **Unready pages (5A)**).

**Out of scope (MVP)**

- **Deep links / notifications** opening the reader (session starts in-app only).  
- **Chat** or Q&A on the summary.  
- **Original PDF rendering** inside the reader (summaries only).  
- **User-selectable summary styles** (single fixed pipeline per README).  
- **Purchasing credits** inside the reader (reuse global out-of-credits patterns from Epic 127 elsewhere).

---

## 2. Normative UX decisions (locked for implementation)

These choices come from the agreed **A/B/C** selection for Epic 130 and must not drift silently.


| # | Topic | Decision |
| --- | --- | --- |
| 1 | **Library boundary (1B)** | Reader spec defines **when** “settled page” is reported for **last-read** persistence; **database writes and RLS** for last-read live under **Epic 131** ([JTI-131](https://linear.app/jtienterprise/issue/JTI-131/epic-library-resume-and-history), [JTI-154](https://linear.app/jtienterprise/issue/JTI-154/mvp-lib-02-resume-last-read-page-per-book)). |
| 2 | **Session entry (2A)** | Reader is opened **only** via in-app navigation with **`bookId: uuid`** and optional **`initialPageIndex: number`** (1-based). No URL scheme / push entry in MVP. |
| 3 | **Summary body (3B)** | Ready `summary_text` is rendered as **Markdown** (see §7). |
| 4 | **Navigation (4B)** | User can go **previous/next** using **on-screen controls** and **horizontal swipe** (see §6). |
| 5 | **Unready pages (5A)** | User may navigate to **any** in-range page; **each page** shows its own **loading / processing / failed** UI without blocking navigation globally. |
| 6 | **Visual references (6A)** | Match listed **PNGs** for density, typography, spacing, and chrome (§8). |
| 7 | **Prefetch (7C)** | After every **settled** page index, the client **must** run the **mandatory prefetch** pattern in §4 (fixed forward depth **3**). |
| 8 | **Docs + Linear (8B)** | This file is canonical; Linear issues point here with anchors. |

---

## 3. Route / navigation parameters

### 3.1 Inputs (normative)

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `bookId` | `uuid` string | yes | Must belong to `auth.uid()` via existing RLS on `books`. |
| `initialPageIndex` | integer | no | **1-based** PDF page index. If omitted, default **`1`**. If provided out of range once `page_count` is known, **clamp** to `1..page_count` and optionally show a one-line toast (“Opened at page …”)—implementation choice, but **no crash**. |

### 3.2 Stack contract

- The reader screen **must** receive `bookId` (+ optional page) through the app router (Expo Router params or an equivalent typed route).  
- **Do not** read `bookId` from global mutable singletons without also passing through params—params are the contract for tests and deep future linking.

---

## 4. Data loading and mandatory prefetch (JTI-148 + 7C)

### 4.1 Canonical API

Use **`fetchPageSummariesForReader`** from `apps/mobile/src/lib/pageSummariesReader.ts`, which wraps RPC **`public.fetch_page_summaries_for_reader`** (see `docs/specs/mvp/summarization-epic-129.md` §11).

Hard limits from that contract (do not fork):

- **`READER_PREFETCH_MAX_BATCH` = 32** — max distinct indices per RPC call.  
- **`next_page_hints`** — up to **3** rows for pages immediately **after** the highest **valid** requested index.

### 4.2 Mandatory prefetch pattern (normative)

Let `p` be the **settled** current page index (1-based, in range). Let `N` be `page_count` from the latest successful fetch (`null` until known).

1. **Initial load:** On first mount with resolved `p`, call the RPC with:

   `p_page_indices = [p, p+1, p+2, p+3]` **intersected** with `[1..N]` once `N` is known; if `N` is still `null`, use **`[p, p+1, p+2, p+3]`** and rely on `invalid_page_index` rows for out-of-range indices until `N` arrives (then clamp subsequent calls).

2. **After every settled page change** (user finished navigating to new `p`): repeat the same **explicit forward window** `min(4, N - p + 1)` indices starting at `p` (i.e. always request **current plus up to three forward pages** when they exist). This satisfies **forward depth = 3** ahead of `p` when in range.

3. **Hints merge:** For every successful response, merge **`pages`** and **`next_page_hints`** into a **page cache** keyed by `page_index` (later RPC results **overwrite** the same key). Hints are **not optional** to ignore when present—they must be merged so the UI can render neighbours without an extra round-trip when hints already cover the next indices.

4. **Deduping:** If a single batch would exceed **32** indices (should not happen with the 4-index window), split into multiple ordered calls in the same tick; never send duplicates (RPC rejects duplicates).

5. **Stale responses:** If the user navigates quickly, **tag** each in-flight request with a **monotonic `requestId`**; ignore responses whose `requestId` is older than the latest settled `p` **unless** the response still updates pages **adjacent** to the current `p` (implementation may merge by `page_index` only—acceptable as long as the **current page** never flashes data from a **different** `page_index` row).

**Rationale:** Epic choice **7C** requires a **fixed, testable** prefetch. Using **four explicit indices** (`p…p+3`) plus hint merge aligns with JTI-148’s **`next_page_hints` length (3)** and keeps payloads tiny.

### 4.3 Refresh rules

- **Pull-to-refresh** (optional MVP): if implemented, it **only** refetches **current `p` through `p+3`** using the same pattern; it must not reset navigation.  
- **Retry on failed page:** After user taps **Try again** for page `p`, refetch **`[p]`** immediately, then run the **§4.2** window again on success transition to `processing`/`pending`.

---

## 5. Cross-epic contract - last-read page (JTI-131 / JTI-154)

Epic 131 owns **where** last-read is stored and how it syncs. Epic 130 owns **when** the reader reports a new “settled” page.

**Normative events (call into the library/reading-progress module Epic 131 will implement):**

| Event | When to fire |
| --- | --- |
| `onReaderSettledPage` | Whenever the reader **finishes** transitioning to a new in-range `page_index` **and** that page is the **active** page for interaction (swipe animation ended or button navigation applied). **Debounce is not allowed** beyond one frame/layout pass—persistence must see **every** settled change. |
| `onReaderUnmount` | Optional safety flush if Epic 131 batches writes—**if** Epic 131 batches, unmount **must** flush pending `p`. |

**Do not** block UI on persistence success; **queue** and log failures (see Epic 132 later). If Epic 131 is not landed yet, implement **`onReaderSettledPage`** as a **no-op stub** in the reader feature folder with a **TODO(JTI-154)** comment so the hook exists.

---

<a id="jti-150"></a>

## 6. JTI-150 - Navigation mechanics (controls + swipe)

### 6.1 Controls (normative)

- **Previous** and **Next** affordances must be **thumb-reachable** on a typical phone (placement per §8 PNGs).  
- **Disabled state:** at page `1`, **Previous** is disabled or no-ops **without** error; at page `N`, **Next** disabled similarly.  
- **Tap targets:** minimum **44×44 dp** effective hit area (platform guideline).

### 6.2 Horizontal swipe (normative)

- **One page per full gesture:** successful swipe changes `p` by **±1** (no free scroll through multiple pages in MVP).  
- **Threshold:** use a distance **and** velocity policy (document constants in code, e.g. `SWIPE_DISTANCE_PT`, `SWIPE_VELOCITY_PT_PER_S`); reject ambiguous micro-moves.  
- **Conflict with vertical scroll:** summary body may scroll vertically inside the page; **horizontal** swipe for page change must use a **gesture arena** / horizontal recognizer that **does not** steal obvious vertical scrolling (e.g. require mostly-horizontal movement for page change).  
- **Edge bounce:** at `1` or `N`, show a **subtle** edge affordance (optional) but **no** loop to last page.

### 6.3 Content area (normative)

- **No chat UI** in the reader route.  
- **Readable typography:** base body **≥ 16 sp** equivalent; line height comfortable for long bullets.  
- **Safe areas:** respect notches / gesture bars.

### 6.4 Definition of done — JTI-150 (testable)

- Given a book with `page_count = N`, navigating with **buttons** visits every index `1..N` without off-by-one errors.  
- **Swipe** moves **exactly one** page per successful gesture in the middle of the range.  
- With `initialPageIndex` provided, the reader **opens** on that page (after clamp rules).  
- Automated or manual test checklist documents **swipe vs vertical scroll** non-regression case.

---

## 7. JTI-150 - Summary presentation (Markdown rendering)

### 7.1 Supported subset

Render `summary_text` with a Markdown renderer that supports at least:

- **Paragraphs**, **bold**, **italic**  
- **Bulleted and numbered lists** (nested **one** level deep for MVP)  
- **Headings** up to `###`  
- **Fenced code blocks** — **style as monospace** but **do not** enable arbitrary script execution (static text only)

### 7.2 Unsupported or dangerous content

- **Raw HTML** from model output: **strip or escape**—do not use `dangerouslySetInnerHTML`-style rendering.  
- **Links:** render as **styled text** without opening in-app browser in MVP **unless** product later expands scope—default: **tap shows non-actionable toast** “Links are not supported in MVP” or strip links; **pick one** in the PR and document.

### 7.3 Empty ready row (should not happen)

If `status === 'ready'` and `summary_text` is null/empty, show the **same** copy as **§9.2** “still preparing” fallback and **log** a structured warning (`reader_empty_ready_page`).

---

## 8. Visual source of truth (design parity)

**PNGs (layout, density, type, spacing):** under `resources/BrivAI designs/`

| File | Use in reader |
| --- | --- |
| `Section 1.png` | Overall **chrome density**, margins, and **top bar** rhythm. |
| `Section 2.png` | **Typography scale** relationships (title vs body). |
| `Frame 1000002389.png` | **List / content panel** spacing and **bottom navigation** proximity. |

**Definition of done — visual:** PR includes a short **“Design parity”** note listing **intentional deviations** from the above references (see `docs/specs/mvp/README.md` → UI design fidelity).

**PDF hints (product, not override):** `resources/BrivAI Features/Core Summarization/`

- `2) Summary Reader.pdf` — layout expectations for summary reading.  
- `3) E-Book Reader Functionality.pdf` — page-by-page behaviour.  

If a PDF conflicts with **Frozen MVP** in `docs/specs/mvp/README.md`, **README wins**.

---

<a id="jti-151"></a>

## 9. JTI-151 - Page position indicator (Page x of y)

### 9.1 Display

- Show **`Page {p} of {N}`** (or equivalent accessible string) whenever `N` is known.  
- While `N` is **unknown**, show **`Page {p}`** plus a **subtle** “total pages loading…” state **or** omit `of N` until first successful fetch returns `page_count`.

### 9.2 Accuracy

- **`N`** must equal **`page_count`** from **`fetch_page_summaries_for_reader`** (authoritative for the reader). If book metadata disagrees elsewhere in the app, **reader follows RPC**.

### 9.3 Definition of done — JTI-151 (testable)

- For `N = 1`, indicator reads **`Page 1 of 1`**.  
- Changing `p` updates the **left** number **immediately** on settle (not mid-animation if avoidable).  
- **Screen reader** label includes the same information (see §11).

---

<a id="jti-152"></a>

## 10. JTI-152 - Loading, processing, failed, timeout UX

### 10.1 States (per page)

| RPC `status` | UI |
| --- | --- |
| `pending` | Calm **“Still preparing this page…”** skeleton or spinner; **no** scary red error. |
| `processing` | Same family as `pending` with copy **“Summarizing…”** (exact strings can ship-tune). |
| `ready` | Markdown body (§7). |
| `failed` | Plain-English **`error_message`** (if non-null) + **`error_code`** in small mono for support logs + **Try again** button calling JTI-149 retry path. |
| `invalid_page_index` | **“This page is outside the book.”** + offer return to nearest valid (implementation choice: clamp to `N` or `1`). |

### 10.2 Timeout (soft)

There is **no** separate hard “network timeout” spec beyond whatever the Supabase client uses; however, if a fetch **hangs** beyond **30s** without response, show **non-destructive** “Still loading…” with **Cancel** (optional) that **keeps** `p` but aborts the UI wait and retries fetch for **`[p..p+3]`** on next user interaction.

### 10.3 Alignment with JTI-149

- **Try again** on `failed` must invoke the **same** server-side summarize entrypoint documented in Epic 129 (no client-only fake retry).  
- After retry dispatch, page should transition to **`processing`/`pending`** in subsequent fetches.

### 10.4 Definition of done — JTI-152 (testable)

- With mocked RPC returning `processing` for `p+1`, user can stay on **`p`** and see ready content, navigate to `p+1`, and see **only** `p+1`’s loading UI.  
- Forced `failed` shows **Try again** and **one** successful retry path in QA notes.  
- No full-screen modal that **blocks** the entire reader for all pages while tail summarization runs (aligns with summarization §1.5).

---

## 11. Accessibility (minimum bar)

- **Previous / Next** controls expose **`accessibilityLabel`** / **`accessibilityHint`** (“Go to previous page”, etc.).  
- **Page indicator** is **`accessibilityElement`** grouping `Page X of Y`.  
- **Swipe:** do not rely on swipe alone—**buttons remain** the accessible path.  
- **Dynamic type:** if quick win exists in the stack, avoid **fixed pixel** text below 16sp equivalent for body.

---

## 12. Analytics / logging (lightweight)

Emit structured logs (console in dev; future Epic 132 may centralize):

| Event | Fields |
| --- | --- |
| `reader_open` | `book_id`, `initial_page` |
| `reader_settle_page` | `book_id`, `page_index` |
| `reader_prefetch_batch` | `book_id`, `indices[]`, `duration_ms`, `ok` |
| `reader_render_error` | `book_id`, `page_index`, `error` |

**No** `summary_text` content in logs.

---

## 13. Suggested implementation order

1. **Route shell** + `bookId` / `initialPageIndex` plumbing.  
2. **RPC client + cache** implementing **§4** prefetch.  
3. **Page chrome** (indicator §9 + buttons §6).  
4. **Markdown body** §7.  
5. **Swipe** gestures §6.2 + conflict resolution.  
6. **Failure / retry** wiring §10.  
7. **`onReaderSettledPage`** hook for **JTI-154** (stub until Epic 131 lands).

Vertical slices are fine if each PR satisfies its issue’s **Definition of done** subset.

---

<a id="jti-130"></a>

## 14. Epic JTI-130 - acceptance criteria (whole epic "done")

- Reader meets **§2** table and all **Definition of done** bullets in **§6.4**, **§9.3**, and **§10.4**.  
- **Mandatory prefetch §4.2** is covered by at least one **automated test** (mock RPC + assert requested indices) or a **scripted QA** checklist signed in the PR.  
- `docs/specs/mvp/README.md` links this file under **Epic: Reader UI**.  
- Linear **JTI-130**, **JTI-150**, **JTI-151**, **JTI-152** link to this document with anchors.

---

## 15. Out of scope (explicit)

- Deep links / universal links into the reader.  
- In-reader purchases or credit editing.  
- Rendering the **original PDF pages** alongside summaries.  
- **Multi-column** desktop layouts; optimize for **phone portrait** first.  
- **Offline** full-book reading (network required for RPC in MVP).

---

## 16. Linear hygiene (keep tickets short)

Epic **JTI-130** should link to this file with **`#jti-130`** (epic acceptance). Issues **JTI-150** / **JTI-151** / **JTI-152** should link to **`#jti-150`** / **`#jti-151`** / **`#jti-152`** respectively.

GitHub URL base (after push to `main`):

`https://github.com/ifandisalim/JTI-BrivAI/blob/main/docs/specs/mvp/reader-epic-130.md`
