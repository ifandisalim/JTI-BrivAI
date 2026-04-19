# Spec: Foundation and delivery spine (Epic 125)

**Linear**

- Epic: **[JTI-125](https://linear.app/jtienterprise/issue/JTI-125/epic-foundation-and-delivery-spine)** — Foundation and delivery spine  
- Issue: **[JTI-133](https://linear.app/jtienterprise/issue/JTI-133/mvp-fnd-01-expo-android-shell-and-app-navigation-skeleton)** — Expo Android shell and app navigation skeleton  
- Issue: **[JTI-134](https://linear.app/jtienterprise/issue/JTI-134/mvp-fnd-02-supabase-project-wiring-client-env-safe-secrets)** — Supabase project wiring (client + env + safe secrets)

**Purpose of this document**

This is the **implementation-grade** spec for the first vertical slice of engineering: a **runnable Android Expo app** in the repo, plus **Supabase client wiring** that is safe for Git and ready for Auth/Credits/Upload work.

---

## 1. Context and assumptions

### 1.1 Product context (plain English)

We are building a mobile app that will eventually upload PDFs and show **page-by-page summaries**. None of that exists in this epic. This epic only establishes the **shell**: the app opens on Android, navigation exists, and the app can talk to Supabase using **public** keys.

### 1.2 Repository state

The repository is currently **greenfield for application code**: there is **no** `apps/` tree yet. This spec assumes you will **create** the Expo app and Supabase layout as part of JTI-133 / JTI-134.

### 1.3 Platform and tooling

- **Primary dev OS in this workspace:** Windows (PowerShell). Commands below use cross-platform tooling where possible; Android builds still require **Android SDK / emulator or USB device**.
- **Target runtime for MVP:** **Android** (physical device or emulator). iOS may be added later without blocking this epic.
- **Language:** **TypeScript** everywhere in the mobile app.

### 1.4 Out of scope for Epic 125 (explicit)

- No **business features**: no PDF upload UI, no summarization, no credits UI beyond placeholders if needed for layout.
- No **production** hardening beyond basic hygiene: `.gitignore`, no secrets in git, minimal error surfaces.
- No **admin dashboard**.
- **Google Play public listing** is not required to close JTI-133/JTI-134; internal install paths are covered lightly in section 8 and fully in the Release epic later.

---

## 2. Normative repository layout

This layout is **normative** for MVP unless a later ADR changes it.

```text
JTI-BrivAI/
  apps/
    mobile/                 # Expo app (Android-first). Own package.json.
      app/                  # Expo Router routes (file-based routing)
      assets/
      src/                  # Non-route modules: lib/, components/, etc. (create as needed)
      app.json              # Or migrate to app.config.ts when env injection is needed
      package.json
      tsconfig.json
  supabase/                 # Created by Supabase CLI in JTI-134
    config.toml
    migrations/             # SQL migrations (empty OK at end of JTI-134)
    seed.sql                # Optional; empty OK
  docs/
    specs/
      mvp/
        README.md
        foundation-epic-125.md   # this file
  resources/                # Existing design + feature PDFs (unchanged)
  .gitignore
  README.md                 # Root developer README (required by JTI-133)
```

**Rules**

- **All mobile product code** lives under `apps/mobile`. Do not create a second mystery app folder.
- **All Supabase database and Edge Function source** lives under `supabase/` at repo root (CLI default). This keeps migrations reviewable in the same repo as the app.
- **Do not** commit `.env` files containing secrets or **service role** keys.

**Optional later (not required to close 133/134)**

- `packages/shared/` for shared TypeScript types—only add when a second consumer exists (e.g. Edge Function + app share DTOs).

---

## 3. Toolchain prerequisites (developer machine)

These are **required** for local Android development and should be documented in the root `README.md` (JTI-133 deliverable).

| Prerequisite | Why it matters | Notes |
|--------------|----------------|-------|
| **Node.js LTS** (20.x or 22.x) | Runs Expo CLI and JS tooling | Pin a single major version in README |
| **Git** | Version control | Already assumed |
| **Watchman** (optional on Windows) | Faster file watching | Expo docs explain platform quirks |
| **Android Studio** + **Android SDK** | Build and run Android | Install a recent **SDK Platform** + build tools |
| **JDK 17** (or version required by your AGP) | Android Gradle | Match Expo SDK’s documented JDK |
| **USB debugging** or **Android Emulator** | Run the app | Emulator: create a Pixel-class AVD |

**Expo Go vs dev client**

- For early MVP scaffolding, **Expo Go** is acceptable for JTI-133 **only if** you do not need custom native modules yet.
- As soon as you add native modules not shipped in Expo Go, you must switch to a **development build** (document that transition in Release epic). This spec does **not** block JTI-133 on dev client unless you already know you need a native module day one.

---

## 4. Epic 125 — overall acceptance criteria

Epic 125 is complete when **all** of the following are true:

1. **Repository structure** matches section 2 (allow empty `supabase/migrations` but folder must exist if CLI was run).
2. **Root `README.md`** explains: install steps, how to run Android, where env vars live, and what “done” means for Foundation.
3. **`apps/mobile` runs on Android** and shows placeholder screens reachable via navigation (JTI-133).
4. **Supabase client is wired** using **only** `EXPO_PUBLIC_*` keys appropriate for client-side use, with `.env.example` committed and `.env` ignored (JTI-134).
5. **Smoke check** succeeds: app starts, navigation works, and the app performs a trivial Supabase interaction that proves config is loaded (exact test in section 7.4).

---

<a id="jti-133"></a>

## 5. JTI-133 - Expo Android shell and app navigation skeleton

### 5.1 Goal

Create **`apps/mobile`** as an **Expo + TypeScript** application using **Expo Router** (file-based routes), with a **minimal route graph** that mirrors the future MVP navigation:

- **Auth gate placeholder** (sign-in screen placeholder)
- **Library placeholder** (list of books later)
- **Reader placeholder** (summary reader later)
- **Settings is not required** for MVP product settings (developer config only); do **not** add a Settings screen unless needed for dev diagnostics.

### 5.2 Create the app (normative steps)

Run from the **repository root** (`JTI-BrivAI/`):

1. Ensure `apps/` directory exists.
2. Create the Expo app **inside** `apps/mobile`.

Use the official Expo creation flow appropriate for the current Expo SDK at implementation time. The **template choice** is normative:

- Prefer **`expo-template-tabs`** (or the current Expo Router tabs starter) **with TypeScript**.

**Example shape (command names may change with Expo versions—follow Expo docs if different):**

```bash
cd apps
npx create-expo-app@latest mobile --template tabs
```

**After creation**

- Move/rename if the tool created `mobile/` in the wrong place; final path must be `apps/mobile`.

### 5.3 Router structure (normative)

Use **Expo Router**. Minimum route files (names can match this intent; adjust to Expo Router conventions for your SDK):

| Route | Purpose |
|-------|---------|
| `app/index.tsx` | Entry redirect: if “not signed in” → auth placeholder; if “signed in” → library placeholder. For JTI-133, **fake** signed-in state behind a **temporary** `__DEV__` constant is acceptable **only** if clearly marked `TODO(JTI-AUTH)` and removed when JTI-135 lands. Prefer starting with **auth-first** flow without fake signed-in. |
| `app/(auth)/sign-in.tsx` | Placeholder UI: “Sign in (coming in Auth epic)” |
| `app/(app)/library.tsx` | Placeholder UI: “Library (coming)” |
| `app/(app)/reader/[bookId].tsx` | Placeholder route with param `bookId` displayed as text |
| `app/_layout.tsx` | Root stack or slot layout wiring |

**Navigation requirements**

- From **library placeholder**, user can navigate to **reader placeholder** with a **hardcoded** `bookId` (for example `test-book`) to prove dynamic routes work.
- **Android hardware back** behavior must not trap the user: pressing back should ascend stacks predictably (Expo Router defaults are usually fine; verify on device).

### 5.4 Android application identity (normative fields)

Set stable identifiers early to avoid painful refactors:

- **`app.json` / `app.config.*`**: `expo.android.package`  
  - **Proposed default:** `com.jtienterprise.brivai` (change only if you already own a different convention).
- **`expo.name` / `expo.slug`**: human readable app name + slug suitable for Expo/EAS.

Document the chosen `applicationId` in root `README.md`.

### 5.5 TypeScript and quality bar (minimum)

- **`strict`** mode enabled in `apps/mobile/tsconfig.json` (Expo templates often enable this—keep it on).
- **No `any`** in new code written for this issue unless justified with a short comment and a follow-up ticket reference.

### 5.6 Root `README.md` requirements (normative)

The repository root `README.md` must include:

1. **Project one-liner** (what BrivAI is becoming).
2. **Prerequisites** (section 3 table in prose form).
3. **Install** (from repo root):

   - How to install `apps/mobile` deps (`cd apps/mobile && npm install` or `pnpm install`—pick one package manager and standardize).

4. **Run Android**:

   - Exact command (`npx expo run:android` vs `npm run android`—pick one and document).
   - Emulator vs device notes.

5. **Environment variables** pointer: “See JTI-134 / `apps/mobile/.env.example`.”

6. **Troubleshooting** (short): Metro cache reset, clean Gradle, common Windows path issues.

### 5.7 JTI-133 acceptance criteria (testable)

**AC-133-1 — App boots on Android**

- **Given** a clean clone and documented installs  
- **When** the developer runs the documented Android command  
- **Then** the app installs and reaches the **sign-in placeholder** (or the documented entry route) without crashing.

**AC-133-2 — Route graph exists**

- **Given** the app is running  
- **When** the developer navigates using in-app buttons/links  
- **Then** they can reach **Library placeholder** and **Reader placeholder** (`bookId` visible).

**AC-133-3 — Docs are sufficient**

- **Given** a new machine with prerequisites installed  
- **When** the developer follows root `README.md` only  
- **Then** they can complete AC-133-1 without asking the maintainer for secret tribal knowledge.

---

<a id="jti-134"></a>

## 6. JTI-134 - Supabase project wiring (client + env + safe secrets)

### 6.1 Goal

Wire **`@supabase/supabase-js`** in `apps/mobile` so the app can reach your Supabase project using **public anon credentials**, with a **documented** local env workflow that will not leak secrets into Git.

### 6.2 Supabase cloud project (manual, outside repo)

**You (human) must** create a Supabase project in the Supabase dashboard if one does not exist yet. Record:

- **Project URL** (looks like `https://<ref>.supabase.co`)
- **anon public key** (safe for mobile clients **when RLS is correctly enforced later**)

**Never** place the **service role** key in the Expo app. Treat service role as **server-only** (later: Edge Functions / secure admin scripts).

### 6.3 Supabase CLI in repo (normative)

Initialize Supabase in the repo root so migrations are tracked:

```bash
# From repo root
npx supabase init
```

This should create `supabase/config.toml` and empty `supabase/migrations/` (or seed files). Commit these.

**Local optional:** `supabase start` for Docker-based local Supabase is **optional** for MVP; if you skip it, document that the app uses the **cloud dev project** for development.

### 6.4 Mobile client module (normative)

Create a small module in the app, for example:

- `apps/mobile/src/lib/supabase.ts`

**Requirements**

- Export `supabase` client created via `createClient(url, anonKey, options)`.
- Read URL and anon key from **Expo public env vars**:

  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

- If either variable is missing at runtime, fail **loudly in dev** (`console.error` + simple in-app error UI in `__DEV__`) and fail **cleanly in prod** (non-crashing screen).

### 6.5 Auth session storage (important for the next epic)

Supabase Auth in React Native requires a **storage adapter** for session persistence.

**Normative requirement for JTI-134**

- Choose the approach recommended by Supabase + Expo at implementation time.
- Acceptable patterns include:

  - `@react-native-async-storage/async-storage` adapter, or  
  - `expo-secure-store` adapter (more secure; slightly more setup).

**Minimum for JTI-134**

- Wire the adapter so `supabase.auth.getSession()` can return a session **after restart** once login exists (Auth epic will complete behavior).
- For the smoke test (section 7.4), it is OK if session is empty—**the wiring must be correct**.

### 6.6 `.env.example` and `.gitignore` (normative)

In `apps/mobile/`:

- Add **`.env.example`** containing:

  - `EXPO_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY`

- Ensure **`.env`** is gitignored (root or app-level—pick one; document which).

**Rule:** `.env.example` must contain **placeholders only**, not real keys.

### 6.7 Deep links / auth redirects (prepare, do not fully implement)

Magic link auth (later epic) will require **redirect URLs** configured in Supabase Auth settings.

**Normative for JTI-134**

- Document in root `README.md` a short subsection: “Future auth redirects” listing the **expected scheme** (for example `brivai://auth-callback`) and note that Supabase dashboard must allow this redirect URL when JTI-135 starts.

No need to implement deep link handlers in JTI-134 unless already trivial; the point is **don’t paint yourself into a corner**.

### 6.8 RLS posture (document only for now)

Row Level Security (RLS) is enforced in Postgres for multi-tenant safety.

**Normative**

- JTI-134 does **not** require full RLS policies for future tables yet.
- Add a short note in this spec and in `README.md`: “All user-owned tables must enable RLS before any sensitive data ships.”

### 6.9 JTI-134 acceptance criteria (testable)

**AC-134-1 — Env wiring**

- **Given** `.env` is created from `.env.example` with valid cloud values  
- **When** the app starts  
- **Then** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are non-empty inside the running app (verified via a dev-only log line or small dev banner gated by `__DEV__`).

**AC-134-2 — Smoke Supabase call**

- **Given** valid env vars  
- **When** the app runs the smoke routine (section 7.4)  
- **Then** the call completes without throwing **OR** returns a controlled, handled error that proves network + URL correctness (for example querying a harmless built-in endpoint if you add one later).  

**Minimum acceptable smoke test for MVP foundation**

Implement **one** of the following (pick the simplest at implementation time):

- **Option A (preferred if available):** call `supabase.auth.getSession()` and render “Supabase reachable” if library responds (even if session null).  
- **Option B:** add a trivial **public** Edge Function `health` later (not required in 134 unless Option A is insufficient).

**AC-134-3 — No secrets in git**

- **Given** a fresh PR  
- **When** searching the diff  
- **Then** there are **no** `.env` files with real keys and **no** service role keys anywhere under `apps/mobile`.

---

## 7. Integration: JTI-133 + JTI-134 “done together”

### 7.1 Suggested implementation order (within Foundation)

1. JTI-133 scaffold app + navigation + root README basics  
2. JTI-134 Supabase init + client module + env files + README env section  
3. Add a **tiny UI proof** on a dev-only screen or dev overlay:

   - Shows “Supabase: OK” / “Supabase: missing env” / “Supabase: error” based on smoke test.

### 7.2 Smoke test definition (normative)

**Smoke test** (manual, 2 minutes):

1. Install app on Android emulator/device.  
2. Confirm placeholders navigation (AC-133-2).  
3. Confirm env loaded (AC-134-1).  
4. Confirm `getSession()` call returns **without unhandled promise rejection** (session may be null).

Capture this as a short checklist in root `README.md`.

---

## 8. Handoff notes for the next epics (non-normative but helpful)

- **Auth epic:** will replace sign-in placeholder and remove any `__DEV__` fake auth shortcuts.  
- **Credits epic:** will require authenticated `user.id` and RLS policies on `profiles` / `credit_ledger`.  
- **Upload epic:** will require Supabase Storage buckets + policies.

---

## 9. Linear description pointers (keep issues short)

When updating Linear, keep issue bodies short and link here:

- **JTI-125:** “Detailed spec: `docs/specs/mvp/foundation-epic-125.md`”  
- **JTI-133:** “Implement section 5 (`JTI-133`).”  
- **JTI-134:** “Implement section 6 (`JTI-134`).”

GitHub link format (after push):

`https://github.com/ifandisalim/JTI-BrivAI/blob/main/docs/specs/mvp/foundation-epic-125.md`
