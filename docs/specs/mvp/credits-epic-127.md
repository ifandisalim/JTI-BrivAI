# Spec: Credits (Epic 127)

**Linear**

- Epic: **[JTI-127](https://linear.app/jtienterprise/issue/JTI-127/epic-credits)** — Credits  
- Issue: **[JTI-137](https://linear.app/jtienterprise/issue/JTI-137/mvp-crd-01-credits-data-model-balance-immutable-ledger)** — Credits data model (balance + immutable ledger)  
- Issue: **[JTI-138](https://linear.app/jtienterprise/issue/JTI-138/mvp-crd-02-grant-starter-free-credits-on-signup)** — Grant starter free credits on signup  
- Issue: **[JTI-139](https://linear.app/jtienterprise/issue/JTI-139/mvp-crd-03-deduct-credits-per-summarized-page-server-enforced)** — Deduct credits per summarized page (server enforced)  
- Issue: **[JTI-140](https://linear.app/jtienterprise/issue/JTI-140/mvp-crd-04-credits-ui-balance-out-of-credits-blocking)** — Credits UI: balance + out-of-credits blocking  

**Purpose**

This spec defines **free credits only** for MVP: a **durable balance** on `public.profiles`, an **append-only ledger** for auditability, a **starter grant** for new users (**50 pages** worth at default economics), a **server-side deduction** path that is **idempotent** per logical operation (so retries do not double-charge), and **UI** to show balance and block work when insufficient.

**Dependencies**

- **Epic 126 (Auth) complete:** `public.profiles` exists; users authenticate with Supabase; `auth.uid()` is stable.  
- Constants in **`apps/mobile/src/config/credits.ts`** must match the SQL migration (see section 3).

---

## 1. Product intent (plain English)

Users receive **starter credits** when their account is created. When the app (later: summarization pipeline) completes billable work **per PDF page**, credits are **deducted on the server** in a way that cannot be bypassed by a hacked client. Users can see their **balance** and understand when they are **out of credits** (no payments in MVP).

**Out of scope**

- Purchases, Stripe, Apple/Google billing.  
- Admin UI to change pricing.  
- In-app user settings to change economics (developer config only).

---

## 2. Economics (normative defaults)

| Constant | Value | Meaning |
|---------|------|---------|
| `STARTER_FREE_PAGES` | **50** | Starter grant equals **50 summarized pages** of headroom at default per-page cost. |
| `CREDITS_PER_SUMMARIZED_PAGE` | **1** | Each successfully summarized **page** costs **1** credit at MVP default. |

**Starter grant total credits:** `STARTER_FREE_PAGES × CREDITS_PER_SUMMARIZED_PAGE` → **50** credits at defaults.

**Single source in app code:** `apps/mobile/src/config/credits.ts`.  
**Single source in database:** the migration `supabase/migrations/20260419160000_credits.sql` embeds the same integers for the starter trigger; **if you change TS constants, update the migration in the same PR** (or move to a `public.app_settings` table in a later epic).

---

## 3. Database design (normative)

### 3.1 `profiles.credit_balance` (server-managed)

Add a non-null integer column on `public.profiles`:

- **`credit_balance`**: `integer not null default 0`  
- Represents **current spendable credits** (denormalized cache maintained alongside ledger writes).

**Client tamper resistance (MVP minimum):** the migration installs a **`BEFORE UPDATE` trigger** on `public.profiles` that rejects changes to `credit_balance` unless a short-lived session setting `app.allow_credit_balance_write=on` is set inside **trusted server functions** (`grant_starter_credits_on_profile`, `consume_credit`) immediately before the guarded `UPDATE`. Authenticated users can still update other profile fields (for example `email`) without touching `credit_balance`.

### 3.2 `public.credit_ledger` (append-only)

**Columns (minimum)**

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | Primary key, `gen_random_uuid()`. |
| `user_id` | `uuid` | FK → `public.profiles(id)` on delete cascade. |
| `delta` | `integer` | Positive grants, negative spends. |
| `reason` | `text` | Examples: `starter_grant`, `page_summary`. |
| `idempotency_key` | `text` | Unique **per user** (see constraint). |
| `metadata` | `jsonb` | Optional structured context (`book_id`, `page_index`, etc.). |
| `created_at` | `timestamptz` | Default `now()`. |

**Constraint (critical)**

- **`unique (user_id, idempotency_key)`** — enables safe retries for the same logical deduction.

**RLS (normative)**

- **`select`**: authenticated users may read **only** their own rows (`user_id = auth.uid()`).  
- **`insert/update/delete`**: **no direct client writes** for `authenticated` (ledger rows are written only from **SECURITY DEFINER** functions/triggers).

### 3.3 Starter grant mechanism (normative)

Implement as a **`after insert on public.profiles`** trigger (or equivalent) that:

1. Inserts a **`starter_grant`** ledger row with idempotency key like `starter_grant:<user_id>`.  
2. Uses **`on conflict (user_id, idempotency_key) do nothing`** so replays never double-grant.  
3. Updates `profiles.credit_balance` **only when** the insert actually happened (or use a single transactional pattern documented in the migration).

**Note:** Profiles may already exist for early dev accounts before this migration lands. The migration should include a **one-time backfill** section (commented or guarded) **or** a manual SQL snippet in this spec’s appendix for local dev—pick one approach and document it in the PR.

### 3.4 Deduction RPC (normative)

Expose a Postgres function, recommended signature:

- **`public.consume_credit(p_idempotency_key text, p_cost int default 1) returns jsonb`**

**Behavior**

- **`security definer`** with a **fixed `search_path`** (`public` only, or empty + fully qualified names—follow team SQL style, but never leave search_path mutable).  
- **`auth.uid()`** must be non-null.  
- **`p_cost`** must be `>= 1` (or treat `null` as 1—pick one and document).  
- **Concurrency:** lock the caller’s `profiles` row (`select ... for update`) before deciding balance.  
- **Idempotency:** attempt ledger insert with negative `delta`; on conflict **do nothing** and return `{ ok: true, charged: false, balance: <current> }`.  
- On successful new insert, decrement `profiles.credit_balance` by `p_cost` and return `{ ok: true, charged: true, balance: <new> }`.  
- If balance insufficient, **no ledger insert**, return `{ ok: false, error: 'insufficient_credits', balance: <current> }`.

**Grants**

- `grant execute on function public.consume_credit(text, int) to authenticated;` (MVP allows the mobile app to call for **early integration tests**; Summarization epic should prefer **Edge Functions with service role** if you want stricter enforcement—document the threat model: authenticated RPC is **“honest client + RLS”**, not anti-tamper against a modified APK).

**Idempotency key format (recommended)**

- Page summarization later: `book:<bookId>:page:<pageIndex>` (stable across retries).

---

<a id="jti-127"></a>

## 4. Epic JTI-127 - acceptance criteria (epic done)

Epic 127 is complete when:

1. **Schema + RLS** match section 3 (JTI-137).  
2. **New users** receive starter credits exactly once (JTI-138).  
3. **`consume_credit`** behaves per section 3.4, including insufficient funds + idempotency (JTI-139).  
4. **UI** shows balance on Library (minimum) and blocks “summarize” actions when credits cannot cover the next unit—until Summarization exists, implement a **dev-only** or **placeholder** button that calls `consume_credit` with a test key to prove UX (JTI-140), **or** wire directly to the first summarization call when that epic lands (document which path you took in the PR).

---

<a id="jti-137"></a>

## 5. JTI-137 - Credits data model (balance + immutable ledger)

### 5.1 Deliverables

- Migration file committed: `supabase/migrations/20260419160000_credits.sql` (or supersede with a new timestamp if already edited—never rewrite applied history).  
- Column `profiles.credit_balance`.  
- Table `credit_ledger` + indexes + RLS policies + **no client writes**.

### 5.2 Acceptance criteria

**AC-137-1** Two authenticated users cannot read each other’s ledger rows.  
**AC-137-2** Authenticated role cannot `insert` into `credit_ledger` directly (verify with a SQL test or Supabase policy test).  
**AC-137-3** `profiles.credit_balance` exists and defaults to `0` for existing rows after migration.

---

<a id="jti-138"></a>

## 6. JTI-138 - Grant starter free credits on signup

### 6.1 Deliverables

- Starter trigger / function as in section 3.3.  
- Verify on a **fresh** test user: ledger contains `starter_grant` and balance is **50** at default economics.

### 6.2 Acceptance criteria

**AC-138-1** First-time profile creation grants **exactly once** (repeat trigger / reinsert profile must not double grant).  
**AC-138-2** Ledger row reason/key matches documented conventions for auditing.

---

<a id="jti-139"></a>

## 7. JTI-139 - Deduct credits per summarized page (server enforced)

### 7.1 Deliverables

- `consume_credit` function per section 3.4 + `grant execute ... to authenticated` (unless you intentionally restrict execution—then document alternative).  
- **Unit-style verification** (SQL or small script): insufficient funds returns `ok:false`; duplicate idempotency returns `charged:false` without changing balance twice.

### 7.2 Acceptance criteria

**AC-139-1** Two rapid calls with the **same** idempotency key never reduce balance more than once.  
**AC-139-2** Balance cannot go negative.

---

<a id="jti-140"></a>

## 8. JTI-140 - Credits UI: balance + out-of-credits blocking

### 8.1 Deliverables

- Read `credit_balance` from `profiles` for the signed-in user (via Supabase `select` with RLS).  
- Display on **Library** screen header or prominent row (MVP minimum).  
- When `credit_balance < CREDITS_PER_SUMMARIZED_PAGE`, show clear copy: user cannot start billable work (placeholder button disabled **or** hidden until Summarization epic wires real actions).

### 8.2 Acceptance criteria

**AC-140-1** Balance visible after cold start without extra taps.  
**AC-140-2** At `0` credits, user sees **out of credits** state (still no payment UI).

---

## 9. Implementation order (normative)

1. **Land migration** + verify RLS with two test users (JTI-137).  
2. **Verify starter grant** on fresh signup (JTI-138).  
3. **Implement + test `consume_credit`** (JTI-139).  
4. **UI** (JTI-140).

---

## 10. Manual test script (epic gate)

1. Create fresh user → balance **50**, ledger shows `starter_grant`.  
2. Call `consume_credit('test:1', 1)` twice → second call `charged:false`, balance unchanged after first deduction.  
3. Spend down to `< 1` → next consume returns insufficient.  
4. Library UI matches database balance after refresh.

---

## 11. Linear links

Epic and children should point to:

`https://github.com/ifandisalim/JTI-BrivAI/blob/main/docs/specs/mvp/credits-epic-127.md`

Use anchors `#jti-127`, `#jti-137`, `#jti-138`, `#jti-139`, `#jti-140` in issue bodies.
