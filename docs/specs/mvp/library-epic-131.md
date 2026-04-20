# Spec: Library resume and history (Epic 131)

**Linear**

- Epic: **[JTI-131](https://linear.app/jtienterprise/issue/JTI-131/epic-library-resume-and-history)** — Library resume and history  
- Issue: **[JTI-153](https://linear.app/jtienterprise/issue/JTI-153/mvp-lib-01-library-list-full-history-of-books)** — Library list (full history of books)  
- Issue: **[JTI-154](https://linear.app/jtienterprise/issue/JTI-154/mvp-lib-02-resume-last-read-page-per-book)** — Resume last-read page per book  

**Purpose**

This document is the **implementation-grade** spec for the **MVP library**: show **all** of the signed-in user’s books with clear **title and status**, **alphabetical** ordering, **pull-to-refresh**, and **resume last-read page** using **device-local storage** (no Supabase column for progress in MVP). The library opens the reader with **`bookId`** and **`initialPageIndex`** so the first paint can match the resume target without an extra round-trip.

**Dependencies**

- **Epic 126:** signed-in user (`auth.uid()` stable).  
- **Epic 128 / `books`:** rows for uploads; list reads only **RLS-visible** books.  
- **Epic 130 (Reader):** reader accepts `initialPageIndex` and emits **`onReaderSettledPage`** / unmount per `reader-epic-130.md` §5 — this epic implements the **consumer** module that persists those events **locally** per choices below.  
- **Frozen MVP:** `docs/specs/mvp/README.md` (full library history; Android-first).

**Out of scope (MVP)**

- **Server-side** last-read (Postgres column or RPC) — not in Epic 131 per product choice **1C**; multi-device sync and reinstall continuity are **explicitly out** unless a later epic adds sync.  
- **Delete book**, **rename title** edits from library (unless a later issue expands MVP).  
- **Semantic “skip front matter / jump to Chapter 1”** — not this epic (see §11).

---

## 1. Product intent (plain English)

The **Library** is the home list for every **book** the user uploaded. Tapping a **ready** book opens the **reader** on the **last page they were reading** on **this device** (if any), otherwise **page 1**. The list is **easy to scan** (alphabetical by title) and can be **refreshed** without leaving the screen.

---

## 2. Normative product choices (locked)

These match the agreed **A/B/C** selection for Epic 131.


| #   | Topic            | Decision |
| --- | ---------------- | -------- |
| 1   | **Storage (1C)** | Last-read lives in **AsyncStorage** (or Expo’s supported async persistent KV), **keyed by** `userId + bookId`. **Not** Postgres in MVP. |
| 2   | **Default (2A)** | If no stored value, treat as **page 1**. |
| 3   | **Writes (3B)**  | Reader still fires **every** settled page change into the progress module; the module **may batch AsyncStorage writes** (debounced and/or interval), but **must flush** the latest `page_index` on **unmount** / **reader background** / **app background** so the user does not lose the **last** position. |
| 4   | **Sort (4C)**    | Library list sorted **alphabetically by `books.title`** (ascending), with deterministic **tie-break** `created_at desc` if titles collide. |
| 5   | **Rows (5A)**    | Only **`status === 'ready'`** rows navigate to the reader; other statuses are **visible** but **not** tappable for open (same class of behavior as current app). |
| 6   | **Refresh (6B)** | **Pull-to-refresh** is **required** in the spec and reloads the list from Supabase. |
| 7   | **Navigation (7B)** | Library navigates with **`initialPageIndex`** passed into the reader route (see §5); reader **trusts** this for **first paint** and reconciles with local progress rules in §4. |
| 8   | **Docs (8A)**    | This file + README link + Linear anchors. |

---

<a id="jti-153"></a>

## 3. JTI-153 - Library list (full history)

### 3.1 Data source (normative)

- Query **`public.books`** for the current user (RLS already restricts rows).  
- `select` at minimum: `id, title, status, error_message, created_at, page_count, content_start_page_index, content_start_method` (for **§4.2** / **129**).  
- **Order:** `order('title', { ascending: true })`, then `order('created_at', { ascending: false })` if the client cannot express multi-key sort in one call, implement **in-memory** stable sort: primary `title.toLocaleLowerCase()` (or `localeCompare`), secondary `created_at` descending.

### 3.2 Pull-to-refresh (normative)

- Wrap the scrollable list in **`RefreshControl`** (or platform equivalent).  
- On refresh: re-run the same query; clear **transient** error banner if the new request succeeds.  
- Show a **subtle** loading state (spinner in refresh header) — do not clear the list to empty during refresh unless the query returns empty.

### 3.3 Empty and error states (normative)

- **Empty:** copy along the lines of “No books yet…” with a primary path to **Add book** (match existing tone).  
- **Error:** user-visible message + **Retry** (or rely on pull-to-refresh as retry).

### 3.4 Definition of done — JTI-153 (testable)

- Given multiple books, list order matches **§2** alphabetical rule on a fixed fixture set.  
- Pull-to-refresh triggers a new fetch and updates visible rows.  
- Non-**ready** books show status and are **not** navigable to reader.  
- Empty and error states behave as above.

---

<a id="jti-154"></a>

## 4. JTI-154 - Resume last-read (AsyncStorage)

### 4.1 Storage layout (normative)

- **Technology:** `@react-native-async-storage/async-storage` (or Expo-supported equivalent already in the project).  
- **Key format (string):** `brivai:lastReadPage:v1:<userId>:<bookId>`  
- **Value (JSON stringified):** `{ "pageIndex": number, "updatedAt": string }` where `pageIndex` is **1-based** and in range `1..page_count` when `page_count` is known (if corruption or out of range, **clamp** on read per below).

### 4.2 Read path (normative)

When the user opens a book from the library:

1. Resolve **`userId`** from Supabase session (`session.user.id`).  
2. **Read** AsyncStorage for the key.  
3. **If** a valid **`pageIndex`** exists in AsyncStorage, use that as **`initialPageIndex`** (last-read **always wins** — ties to Epic **130** / **129** product choice **5A**).  
4. **Else** (no local last-read): load **`books.content_start_page_index`** (**`S`**) from the same book row used for the tap (extend `select` to include **`content_start_page_index`** and optionally **`content_start_method`** for UX). Use **`initialPageIndex = max(1, min(S, page_count ?? S))`**.  
5. **Else** if **`S`** is unavailable (error), **`initialPageIndex = 1`**.  
6. If **`pageIndex` &gt; `page_count`** once known, **clamp** to `page_count`.  
7. Navigate to reader with **`initialPageIndex`** as in §5; pass through **`content_start_method`** (or equivalent) if the reader needs it for **one-time** copy per `summarization-epic-129.md` §16.3.

### 4.3 Write path (normative)

Implement a small module, e.g. `apps/mobile/src/lib/readingProgress.ts`, used by the reader:

- **`recordSettledPage(userId, bookId, pageIndex)`** — called on **every** `onReaderSettledPage` from the reader (no client-side “skip events” for batching **logic** — batching applies only to **I/O**).  
- **In-memory last value** always updates immediately.  
- **AsyncStorage writes** may be **debounced** (e.g. 500–1500 ms) **and/or** coalesced while swiping fast.  
- **Mandatory flush** to disk of the **latest** `pageIndex` when:  
  - reader screen **unmounts**, or  
  - app transitions to **background** (`AppState`), or  
  - user leaves reader via **back** navigation.  

**Do not** block UI on `setItem` completing; surface failures only in `__DEV__` logs (Epic 132 can formalize).

### 4.4 Definition of done — JTI-154 (testable)

- Force-kill and reopen app: last-read position for a book is still restored when opening from library (same device).  
- Rapid swiping then immediate back: stored page matches **last settled** page (flush on unmount).  
- New book / missing **local** key opens at **`S`** when **`content_start_page_index`** is present on **`books`**, otherwise **page 1** (see `summarization-epic-129.md` §16.2).  
- Uninstall app / new device: progress **not** expected to survive (1C).

---

## 5. Route contract: library → reader (7B)

### 5.1 Shape (normative)

Use Expo Router **params** (same meaning as `reader-epic-130.md` §3):

- **`bookId`**: string UUID.  
- **`initialPageIndex`**: optional; **integer 1-based**. Omit **only** when intentionally defaulting to 1 in the reader (library should usually pass explicitly after §4.2 read).

Example pattern:

- `router.push({ pathname: '/reader/[bookId]', params: { bookId: b.id, initialPageIndex: String(initial) } })`  
  (Exact API must match `expo-router` typing in-repo.)

### 5.2 Single source of truth on open

On **first** open:

1. **`initialPageIndex` from the route** (if present and valid) wins for **first paint**.  
2. Reader may **re-read** local progress module to **reconcile** if needed; for MVP, **library-computed initial + local writes** should stay consistent.

---

<a id="jti-131"></a>

## 6. Epic JTI-131 - acceptance criteria (whole epic “done”)

- **JTI-153** and **JTI-154** acceptance blocks above are satisfied.  
- `docs/specs/mvp/README.md` links this file under **Epic: Library resume and history**.  
- Linear **JTI-131**, **JTI-153**, **JTI-154** link to `#jti-131`, `#jti-153`, `#jti-154` in this document.  
- Reader integration: **`onReaderSettledPage`** is wired from `reader-epic-130` implementation to **`recordSettledPage`** (or equivalent); **not** a permanent no-op.

---

## 7. Security and privacy notes

- AsyncStorage is **not** encrypted for secrets; **do not** store tokens there — only **page numbers** and timestamps.  
- Keys include **userId** to avoid collisions if session changes after sign-out/sign-in on a shared device (re-query keys or clear namespace on sign-out — **normative:** on **sign out**, optional `multiRemove` of keys with prefix `brivai:lastReadPage:v1:<oldUserId>:` **if** feasible without listing all books; otherwise stale keys for another user id are harmless if `userId` is in the key and lookups always use current uid).

---

## 8. Suggested implementation order

1. `readingProgress.ts` (read/write + flush hooks).  
2. Library query + **alphabetical** sort + **pull-to-refresh**.  
3. Pass **`initialPageIndex`** when navigating to reader.  
4. Reader wires **`onReaderSettledPage`** → `recordSettledPage`.

---

## 9. Out of scope (explicit)

- Server-synced last-read, cross-device resume.  
- Cloud backup of reading position.  
- Library search/filter folders.  
- Editing book titles from the library.

---

## 10. Linear hygiene (keep tickets short)

Epic **JTI-131** should link to **`#jti-131`**. Issues **JTI-153** / **JTI-154** should link to **`#jti-153`** / **`#jti-154`**.

GitHub URL base (on `main`):

`https://github.com/ifandisalim/JTI-BrivAI/blob/main/docs/specs/mvp/library-epic-131.md`

---

## 11. Body start **`S`** (Epic 129, not Epic 131)

**Detection** of **`S`** and **summarization priority** are specified in **`summarization-epic-129.md` §15–16** ([JTI-157](https://linear.app/jtienterprise/issue/JTI-157/mvp-sum-07-content-start-detection-hybrid-bookscontent-start-page) / [JTI-158](https://linear.app/jtienterprise/issue/JTI-158/mvp-sum-08-priority-window-ss9-tail-fill-libraryreader-default-toast)). **Epic 131** only **reads** `books.content_start_page_index` when resolving **`initialPageIndex`** if there is **no** local last-read (§4.2).
