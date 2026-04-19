# Spec: PDF upload and validation (Epic 128)

**Linear**

- Epic: **[JTI-128](https://linear.app/jtienterprise/issue/JTI-128/epic-pdf-upload-and-validation)** — PDF upload and validation  
- Issue: **[JTI-141](https://linear.app/jtienterprise/issue/JTI-141/mvp-upl-01-pdf-pick-upload-to-supabase-storage)** — PDF pick + upload to Supabase Storage  
- Issue: **[JTI-142](https://linear.app/jtienterprise/issue/JTI-142/mvp-upl-02-validate-pdf-only-50mb-max-300-pages-max-server)** — Validate PDF-only, 50MB max, 300 pages max (server authoritative)  
- Issue: **[JTI-143](https://linear.app/jtienterprise/issue/JTI-143/mvp-upl-03-create-book-record-processing-state-machine)** — Create book record + processing state machine

**Purpose**

This document is the **implementation-grade** spec for getting a **real PDF** from the Android app into **durable storage**, proving **MVP limits** on the **server**, and creating a `**books` row** the summarization pipeline and reader can attach to.

**Dependencies**

- **Epic 125 (Foundation)** and **Epic 134** wiring: Expo app + Supabase client env.  
- **Epic 126 (Auth):** uploads and rows are **scoped to `auth.uid()`**.  
- **Epic 127 (Credits):** not required to *upload*, but the library UX may already show balance; do not charge credits on upload (charging is **per summarized page**, later epic).

---

## 1. Normative MVP limits (do not drift)

These are frozen in `docs/specs/mvp/README.md` and apply here:


| Rule          | Value                                           |
| ------------- | ----------------------------------------------- |
| File type     | **PDF only** (see validation rules below)       |
| Max file size | **50 MB** (binary bytes on wire and in storage) |
| Max pages     | **300** PDF pages                               |


**Happy path content:** non-fiction **text** PDFs. **Scanned** PDFs are not MVP-complete for *summarization*, but upload may still succeed; the summarization epic must fail clearly when extraction yields no usable text.

**Product (upload time):** do **not** show a separate “this looks scanned” warning during pick/upload. Unclear or scanned-heavy PDFs are handled when summarization cannot produce text (see summarization epic).

---

## 1.5 Product intent — user experience (confirmed)

These choices are **normative for UX copy and flows** in Epic 128. Implementation details stay flexible unless noted.


| #   | Topic                                    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **While uploading**                      | User stays on an **upload / progress** screen until upload **and** server validation **finish or fail**. No MVP promise that they can leave immediately and still know the outcome without checking the library.                                                                                                                                                                                                                                 |
| 2   | **After success**                        | User is taken back to the **library**; the new book appears in the list (e.g. **top**, newest first). Opening the reader immediately after upload is **out of scope** for this epic unless a later epic explicitly defines that handoff.                                                                                                                                                                                                         |
| 3   | **Validation errors**                    | One **short plain-English** message plus **one obvious next step** (e.g. “Choose another PDF under 50 MB”). No raw stack traces or HTTP text.                                                                                                                                                                                                                                                                                                    |
| 4   | **Failed imports in the library**        | Books in `**failed`** (or equivalent) validation state **stay in the library list** with a **clear failed state** and the user-facing reason, not only a one-shot toast.                                                                                                                                                                                                                                                                         |
| 5   | **App killed or bad network mid-upload** | Messaging is **honest**: the user may need to **start the upload again**. Do **not** promise background resume or auto-retry unless that behavior is explicitly built and covered in acceptance tests.                                                                                                                                                                                                                                           |
| 6   | **Scanned PDFs**                         | Same as §1: warning **when summarization fails**, not at upload.                                                                                                                                                                                                                                                                                                                                                                                 |
| 7   | **Default book title**                   | **Original filename** without the `.pdf` extension (until a rename feature exists).                                                                                                                                                                                                                                                                                                                                                              |
| 8   | **Trust (near upload)**                  | Include a short line such as: **Your PDF stays in your account; we use it to make summaries for you.** (Wording can vary slightly; meaning must not overclaim, e.g. no “we never train models” unless legal/product approves that exact claim.)                                                                                                                                                                                                  |
| 9   | **Visual design**                        | Match `**resources/BrivAI designs/`** for layout, color, and typography on flows this epic touches (library list rows for new/failed books, upload/progress presentation). For upload **flow** detail, see also `**resources/BrivAI Features/Core Summarization/1) Fille Upload.pdf`** where it does not conflict with frozen MVP scope (`docs/specs/mvp/README.md`). **Intentional** deviations (time, RN limits) must be **listed in the PR**. |


---

## 2. High-level flow (target end state)

1. User taps **Add book** (or equivalent) in the signed-in app.
2. Android **document picker** returns a PDF **content URI** / asset.
3. App creates or reserves a `**books` row** (see sections 4 and 9) and uploads bytes to **Supabase Storage** under a deterministic private path (JTI-141).
4. **Server-side validation** runs on the stored object (magic bytes / MIME, size, page count) (JTI-142).
5. `books.status` moves through a **small state machine**; failures set a user-safe `error_code` / message (JTI-143).
6. On success, the book is **ready for the summarization pipeline** (next epic), which may be triggered by DB insert, Edge Function, or explicit job row—**pick one approach in implementation** and document it in code comments + this spec’s section 9.3.
7. **User-facing:** on success, navigate to the **library** (§1.5 row 2). While steps 3–5 run, the user remains on the **upload progress** experience (§1.5 row 1).

---

## 3. Storage design (normative intent)

**Bucket:** create a **private** bucket (example name: `book_pdfs`)—final name is up to implementation but must be **one documented bucket** for MVP PDFs.

**Object key shape (recommended):** `{user_id}/{book_id}.pdf`

- `**user_id`** matches `auth.users.id` / `profiles.id`.  
- `**book_id**` is the UUID primary key of `public.books`.

**RLS / policies:** only the **owning authenticated user** can `insert/select/update/delete` (if needed) objects under their `user_id` prefix. **Service role** (Edge Functions / server) may read for validation. Do **not** expose **public** read URLs for raw PDFs in MVP unless product explicitly changes.

**Client upload path:** prefer **resumable / standard Supabase storage upload** from the mobile client using the anon key **plus** RLS-safe storage policies, **or** short-lived **signed upload URL** from an Edge Function—choose the simplest approach that satisfies RLS and Android reliability.

---

## 4. Database: `public.books` (normative minimum)

Add a `public.books` table (names may vary slightly but **concepts are required**):


| Column            | Type                                  | Notes                                                                     |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `id`              | `uuid`                                | PK, default `gen_random_uuid()`.                                          |
| `user_id`         | `uuid`                                | FK → `public.profiles(id)` / `auth.users`, **not null**.                  |
| `title`           | `text`                                | Display name; default from filename sans extension.                       |
| `source_filename` | `text`                                | Original picker filename (for support/debug).                             |
| `storage_bucket`  | `text`                                | e.g. `book_pdfs`.                                                         |
| `storage_path`    | `text`                                | Full object key inside bucket.                                            |
| `byte_size`       | `bigint`                              | Declared or measured size at upload time.                                 |
| `page_count`      | `integer`                             | **Null until validated**; set by server validator.                        |
| `status`          | `text` (or enum via check constraint) | State machine (section 9.2).                                              |
| `error_code`      | `text`                                | Nullable; machine-oriented (`too_large`, `too_many_pages`, `not_pdf`, …). |
| `error_message`   | `text`                                | Nullable; **safe for end users** (no stack traces).                       |
| `created_at`      | `timestamptz`                         | default `now()`.                                                          |
| `updated_at`      | `timestamptz`                         | optional; maintain on transitions.                                        |


**RLS**

- `select/insert/update` for `authenticated` **only where** `user_id = auth.uid()`.  
- Deletes: MVP can **disallow client deletes** initially (only server maintenance) to avoid orphan storage objects—if you allow delete, specify **storage + row** cleanup in the same transaction or documented compensating job.

**Indexes**

- `(user_id, created_at desc)` for library listing later.

---

## 5. Server validation rules (JTI-142)

Validation that affects abuse and correctness **must run server-side** (Edge Function, Database Webhook + worker, or other **trusted** context). Client-side checks are **UX hints only**.

**5.1 PDF type**

- Reject non-PDF by **magic bytes** (`%PDF-` at offset 0) **and** content-type where available.  
- Optional: reject encrypted PDFs if libraries make that easy; if not easy, document as **known limitation** and let summarization fail later.

**5.2 Size**

- Reject if stored object `byte_size > 50 * 1024 * 1024`.

**5.3 Page count**

- Compute with a **trusted** PDF parser on the server.  
- Reject if `page_count > 300`.  
- If page count cannot be determined, treat as `**failed_validation`** with a clear code (do not silently continue).

**5.4 Responses**

- Persist human-readable `**error_message`** + stable `**error_code**` on `books` for failed validation.  
- App maps codes to short UI strings (no raw HTTP dumps). Each surfaced error must include **one clear next action** for the user (see §1.5 row 3).

---



## 6. Epic JTI-128 — overall acceptance criteria

Epic 128 is complete when **all** of the following are true:

1. A signed-in Android user can **pick a PDF** and complete an upload for a representative non-fiction text PDF within limits.
2. **Oversized**, **too many pages**, or **non-PDF** files end in **failed** states with **clear user messaging**, even if the client is tampered with.
3. A `**books` row** exists for every successful attempt path, with `**storage_path`** pointing at the bytes in Storage.
4. Spec links in Linear for **JTI-128, JTI-141–JTI-143** resolve to **this file** (anchors below).
5. **No credit deduction** occurs on upload (credits remain tied to summarized pages only).
6. **User experience** matches **§1.5 rows 1–8** (blocking upload path, library after success, errors with next step, failed books listed, honest interrupt messaging, default title from filename, trust line).
7. **Visual design** matches **§1.5 row 9**: implementer checks applicable PNGs in `resources/BrivAI designs/` (and the upload feature PDF if used) before merge; document any deliberate gaps in the PR.

---



## 7. JTI-141 — PDF pick + upload to Supabase Storage

### 7.1 Goal

User selects **one PDF** from the device; the app uploads it to **private** Supabase Storage associated with the user.

### 7.2 UX / engineering notes

- Use Android-supported picker flows (`expo-document-picker` or equivalent).  
- Show **upload progress** on a **blocking-style** flow: user stays on this path until done or failed (§1.5 row 1). Indeterminate progress is OK for MVP if documented.  
- Show the **trust line** from §1.5 row 8 on or near this flow (first upload is enough if copy is duplicated later).  
- **Cancel:** acceptable MVP behavior is “best effort cancel + user must retry”; document actual behavior.  
- **Retry / interrupted session:** align copy with §1.5 row 5; if upload fails mid-flight, user can retry; avoid creating **orphan** storage objects—prefer **create `books` row first** with `status = uploading` then finalize, or use a temporary key then rename—**document the chosen strategy** in the PR.

### 7.3 Definition of done (testable)

- From a clean app session, user can upload a **≤50MB**, **≤300 page** text PDF and see the book reach a **non-error** post-validation state (`ready`, per section 9.2).  
- Network failure mid-upload produces a **recoverable** UX (message + retry), without wedging the app.

---



## 8. JTI-142 — Validate PDF-only, 50MB max, 300 pages max (server authoritative)

### 8.1 Goal

Attackers or buggy clients cannot bypass MVP limits.

### 8.2 Definition of done (testable)

- Integration test or scripted check proves: **tampered client claims** cannot mark a book valid when object is non-PDF, **>50MB**, or **>300** pages.  
- Validation runs **after** the object exists in Storage (or validates streamed length if you implement streaming—either way, **server** enforces limits).  
- Failure updates `**books.status` + `error_*`** fields consistently.

---



## 9. JTI-143 — Create book record + processing state machine

### 9.1 Goal

After upload + validation, there is a **durable book entity** for the summarization epic to consume.

### 9.2 State machine (MVP minimum)

Normative **allowed values** for `books.status` (exact spelling up to implementation, but must be **documented in one enum/constant module**):


| Status       | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `uploading`  | Row created; bytes may still be transferring.        |
| `validating` | Bytes present; server validation in progress.        |
| `ready`      | Validation passed; eligible for summarization queue. |
| `failed`     | Terminal failure (validation or storage integrity).  |


**Optional later states** (`processing`, `partial`, etc.) belong primarily to the **summarization** epic; if you add them here for forward compatibility, define **who** transitions them.

### 9.3 Definition of done (testable)

- Every uploaded book has **one** `books` row with **non-null** `user_id`, `storage_bucket`, `storage_path`, `byte_size`, and coherent `status` transitions.  
- `page_count` is populated **only after** successful validation.  
- `failed` rows remain listable (library epic) with a **clear title + failed badge**—exact UI can be minimal in JTI-141–143 as long as data supports it.

---

## 10. Out of scope (explicit)

- **Summarization**, per-page text extraction, LLM calls.  
- **Purchases** / credit changes on upload.  
- **iOS** polish (Android-first MVP).  
- **Admin UI** for reprocessing books (use Supabase dashboard / SQL if needed).

---

## 11. Suggested implementation order inside this epic

1. **JTI-143 (schema + RLS + status defaults)** — unblock storage path that references `book_id`.
2. **JTI-141 (picker + upload)** — prove bytes land under RLS.
3. **JTI-142 (validator)** — close the abuse loop and flip `books.status` / `page_count`.

This order can flex **if** you prefer “upload to scratch path first” **but** document the revised flow in the PR and keep **server validation** mandatory.