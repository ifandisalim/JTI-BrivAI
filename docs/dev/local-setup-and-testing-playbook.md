# Local dev setup and testing playbook (JTI-159)

Point-form **English** instructions to set up this repo, configure **Supabase** and **env**, run **automated tests**, and smoke-test in the **browser** and on **Android** (emulator or phone) before production deploy.

For a local-first Windows flow with one-command startup scripts, see `[local-first-runbook.md](./local-first-runbook.md)`.

**Canonical references:** root `[README.md](../../README.md)`, `[apps/mobile/.env.example](../../apps/mobile/.env.example)`, [MVP index](../specs/mvp/README.md).

---

## A. Prerequisites (install once)

- **Node.js** **20.x** or **22.x** (LTS). Pick one major version for the team and use it consistently.
- **Git** — clone this repo (**JTI-BrivAI**).
- **npm** — ships with Node; this app uses **npm** under `**apps/mobile`** only (not pnpm at the app layer).
- **Android (native builds / emulator):**
  - **Android Studio** — install a recent **Android SDK Platform** and **SDK Build-Tools**.
  - **JDK 17** — align with what **Expo SDK 54** / your Android Gradle Plugin expects (match Android Studio’s bundled JDK or docs).
  - **Android Emulator (AVD)** — e.g. Pixel-class image **or** a **physical device** with **USB debugging** (or wireless debugging if your team documents it).
- **Optional:** **Watchman** — can help Metro file watching on macOS/Linux.
- **Windows:** keep the clone path **short**; if builds fail oddly, add an **antivirus exclusion** for the repo folder.

---

## B. Repository install

- From **repo root**: `cd apps/mobile`.
- Run: `npm install`.
- **Do not** commit secrets — `**apps/mobile/.env`** is gitignored and stays local only.

---

## C. Supabase (cloud dev — typical path)

- In [Supabase Dashboard](https://supabase.com/dashboard), create or open a **development** project.
- Copy **Project URL** and **anon (public) key** — safe in the mobile app **when RLS** is enforced on user data (see migrations).
- **Never** put the **service role** key in `**apps/mobile/.env`** or any **client** bundle; it bypasses RLS and is for **server-side** / Edge Functions secrets only.

### C.1 Apply database migrations

Migrations live in `**supabase/migrations/`** at repo root. Apply them to your **cloud** project in **timestamp order** (filenames sort correctly).

**Option 1 — Supabase CLI (recommended when linked)**

- Install CLI: [Supabase CLI docs](https://supabase.com/docs/guides/cli).
- From **repo root** (where `supabase/config.toml` lives):
  - `supabase login` (once).
  - `supabase link --project-ref <your-project-ref>` (once per machine; ref is the subdomain of `https://<ref>.supabase.co`).
  - `supabase db push` — applies pending migrations to the linked remote database.

**Option 2 — Dashboard SQL**

- Open **SQL Editor** in the dashboard.
- Run each file in `**supabase/migrations/`** in order (oldest → newest), or paste combined SQL if you know what you are doing.

**Local Docker (optional)**

- `supabase start` from repo root runs local Postgres/API; not required for typical mobile-only dev if you use a cloud project and `.env` URL/anon key.

### C.2 Edge Functions (only if you test upload / summarization flows)

Source: `**supabase/functions/`**. Deploy from repo root with CLI, e.g. `supabase functions deploy <name> --project-ref <ref>` (see [Edge Functions deploy](https://supabase.com/docs/guides/functions/deploy)).


| Function folder         | Purpose (short)                             |
| ----------------------- | ------------------------------------------- |
| `extract-book-pdf-page` | Extract text from a PDF page (server-side). |
| `validate-book-pdf`     | Validate PDF limits / type.                 |
| `summarize-book-page`   | Summarize one page.                         |
| `summarize-book-pages`  | Batch / multi-page summarization path.      |


**Secrets (set in Supabase Dashboard → Edge Functions → Secrets, or CLI secrets)** — **not** in the mobile `.env`:

- `**SUPABASE_URL`** — project URL (often auto-injected when deploying; confirm in dashboard).
- `**SUPABASE_SERVICE_ROLE_KEY`** — **server only**; never in the app client.
- `**SUPABASE_ANON_KEY`** — required by summarization functions to persist with caller JWT (see function code).
- `**OPENAI_API_KEY`** — required where OpenAI is called (validate/summarize paths).
- `**OPENAI_SUMMARY_MODEL`** — optional override (defaults exist in shared code).

For **sign-in + library + reader smoke** only, you may **skip** deploying functions until you exercise those features.

### C.3 Auth URL configuration (magic link / deep links)

- App scheme: `**brivai`** (`scheme` in `apps/mobile/app.json`).
- Magic link redirect is built with `**Linking.createURL('auth/callback')`** (Expo) — often `**brivai://auth-callback`** style path depending on Expo version; **add the exact redirect URL** Supabase shows in the magic-link flow to **Authentication → URL Configuration** (Redirect URLs / Site URL as per Supabase docs).
- For **Expo Go**, dev URLs may use `**exp://`** — add temporary redirect URLs Supabase requires for your dev host if magic link testing fails.
- **Never** document or paste **service role** keys in client setup instructions.

---

## D. Environment variables (mobile app)

- From **repo root**: `cp apps/mobile/.env.example apps/mobile/.env`.
- Edit `**apps/mobile/.env`**:
  - `**EXPO_PUBLIC_SUPABASE_URL`** = `https://<ref>.supabase.co`
  - `**EXPO_PUBLIC_SUPABASE_ANON_KEY`** = **anon** key only
- After changes, restart Metro: from `apps/mobile`, `npx expo start --clear` if values look stale.

---

## E. Automated tests (JS unit tests)

- From `**apps/mobile`**: `npm test` (runs **Vitest** on `src/**/*.test.ts`).
- Run after dependency or logic changes; does **not** replace Android or Supabase integration checks.

---

## F. Test in the browser (smoke)

- From `**apps/mobile`**: `npm run web` → `**expo start --web`**.
- Open the URL the CLI prints (often **localhost**).
- **Limitation:** Expo **web** is a **smoke check** for bundle/router; not a substitute for **Android** (filesystem, deep links, native modules differ).
- **Smoke:** app loads; **Sign-in** / **Library** routes reachable without a red screen; **dev** Supabase banner matches root README (see **H**).

---

## G. Test on Android Emulator

- Start an **AVD** (Android Studio) **or** `emulator -avd <name>` (with SDK tools on `PATH`).
- From `**apps/mobile`**:
  - **Dev client (native):** `npm run android` → `npx expo run:android` — builds, installs, launches (use once native code / prebuild matters).
  - **Expo Go (faster):** `npm run android:go` → `expo start --android` — pick emulator when prompted.
- **Android package:** `com.jtienterprise.brivai` (see root README).
- Confirm: app launches, navigation works, **back** stack sane; `**brivai`** scheme ready for auth deep links per README.

---

## H. Test on a physical Android phone

- Enable **Developer options** + **USB debugging** (or wireless debugging per team docs).
- Connect USB; accept **RSA fingerprint** on device.
- `adb devices` → device should show as `**device`** (not `unauthorized`).
- From `**apps/mobile`**, same as **G** (`npm run android` or `npm run android:go`); choose the phone when prompted.
- Repeat **smoke** from emulator; on a real network, watch for **TLS** / **captive portal** / **wrong Supabase URL** issues.

---

## I. Smoke checklist (~2 min, aligned with root README)

- Dependencies: `cd apps/mobile && npm install`.
- `**.env`** filled with **real** `EXPO_PUBLIC_SUPABASE_`* values.
- Optional quick: `npm test` from `apps/mobile`.
- Android: `npm run android` or `npm run android:go`.
- Land on **sign-in** placeholder (or real auth when wired).
- **Dev build:** top banner **Supabase: OK** or a **clear** error — **no** unhandled rejection from session check in Metro/logs.
- **Library** → **Open reader (test-book)** → `**bookId`** shows `test-book` (or current test route).
- **System back** returns through the stack without getting stuck.

---

## J. Troubleshooting

- **Metro cache:** `npx expo start --clear` from `apps/mobile`.
- **Gradle:** `cd apps/mobile/android && ./gradlew clean` (only after `**android/`** exists from prebuild). Deleting `**android/`** and re-running `**npx expo prebuild`** is destructive to local native edits — coordinate with the team.
- **Env not loading:** full restart of Metro; verify `**EXPO_PUBLIC_`** spelling matches `.env.example`.
- **Windows:** short paths + antivirus exclusions (see **A**).

---

## K. MVP scope context

- Frozen MVP decisions and epic list: `**[docs/specs/mvp/README.md](../specs/mvp/README.md)`**.

---

## Definition of done (this playbook)

- One **point-form** doc (this file) a new developer can follow **end-to-end** on a clean machine.
- Covers **browser**, **Android emulator**, and **physical Android**.
- Lists installs, **Supabase** steps, `**.env`**, **Auth URLs**, **migrations**, and **functions** when “full” pipeline testing is needed.
- **No** service role keys in **client** instructions.