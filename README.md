# JTI BrivAI

BrivAI is becoming a mobile app for uploading PDFs and reading **page-by-page summaries** (MVP scope grows in product specs). This repo currently holds the **Android-first Expo shell** and foundation work.

**Full local setup (web + Android + Supabase + tests):** see [`docs/dev/local-setup-and-testing-playbook.md`](docs/dev/local-setup-and-testing-playbook.md) (JTI-159). This README stays the short entry; the playbook expands commands and checklists.

## Prerequisites

Install these on the machine where you build and run the app:

- **Node.js** 20.x or 22.x (LTS). Pick one major version for the team and stick to it.
- **Git** for cloning and PRs.
- **npm** (ships with Node.js). This repo standardizes on **npm** under `apps/mobile`.
- **Android Studio** with a recent **Android SDK Platform** and **SDK Build-Tools** (for `expo run:android` and Gradle).
- **JDK 17** (or the version your Android Gradle Plugin / Expo SDK documents—match what Android Studio uses for command-line builds).
- **Android Emulator** (create a Pixel-class AVD) **or** a physical device with **USB debugging** enabled.
- **Watchman** (optional): can speed up Metro file watching on some setups; Expo documents when it helps.

**Expo Go vs dev build:** For this scaffold, **`npm run android:go`** uses Expo Go (quick loop). **`npm run android`** runs **`npx expo run:android`**, which builds a **dev client** (native project) and is the path you need once you add native modules Expo Go does not ship.

## Android application id

The Android `applicationId` is **`com.jtienterprise.brivai`** (`expo.android.package` in `apps/mobile/app.json`).

## Install

From the **repository root**:

```bash
cd apps/mobile
npm install
```

## Run on Android

From **`apps/mobile`**:

1. Start an emulator or plug in a device with USB debugging.
2. Run:

```bash
npm run android
```

This runs **`npx expo run:android`**, installs the dev build, and launches the app.

**Expo Go (no native prebuild):**

```bash
npm run android:go
```

Then choose the running emulator/device when Metro opens.

## Run on web (optional quick check)

From `apps/mobile`:

```bash
npm run web
```

Useful when you only need to confirm the JS bundle and navigation without the Android toolchain.

## Environment variables (Supabase — JTI-134)

1. In the **Supabase dashboard**, create or open a dev project and copy the **Project URL** and the **anon public** key (safe for the mobile app when Row Level Security is enforced on your tables later).
2. From the repo root, copy the template:

   ```bash
   cp apps/mobile/.env.example apps/mobile/.env
   ```

3. Edit **`apps/mobile/.env`** and set:

   - **`EXPO_PUBLIC_SUPABASE_URL`** — e.g. `https://<ref>.supabase.co`
   - **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** — the **anon** key only

**Never** put the **service role** key in the app or in `.env` that ships to clients; that key bypasses RLS and belongs on servers only.

**Git:** **`apps/mobile/.env`** is ignored (see `apps/mobile/.gitignore` and the root `.gitignore`). **`apps/mobile/.env.example`** stays in git with placeholders only.

Restart Metro after changing env (`npx expo start --clear` if values look stale).

## Supabase CLI (`supabase/` at repo root)

Database migrations and Edge Function source for this project live under **`supabase/`** (from `npx supabase init`). **Local Docker** (`supabase start`) is optional; day-to-day dev can use your **cloud** Supabase project via the env vars above.

## Future auth redirects (for the Auth epic)

When magic links or OAuth land, Supabase will need allowed redirect URLs. Plan for a custom scheme such as **`brivai://auth-callback`** and add it in the Supabase Auth URL configuration when that work starts.

## Row Level Security (RLS)

**All user-owned tables must have RLS enabled** before any sensitive data ships. Foundation does not add app tables yet; this is a reminder for later migrations.

## What “Foundation” means here (JTI-133)

- The app opens to the **sign-in placeholder** (auth-first entry).
- You can open the **library placeholder** and navigate to the **reader** with a dynamic **`bookId`** (try **`test-book`** from the library screen).
- Android **back** should walk the stack normally (Expo Router + native stack defaults).

## Smoke check (about 2 minutes)

1. Install dependencies (`cd apps/mobile && npm install`).
2. Copy **`apps/mobile/.env.example`** to **`apps/mobile/.env`** and set **real** `EXPO_PUBLIC_SUPABASE_*` values from your Supabase project (see **Environment variables** above).
3. On Android: `npm run android` (or `npm run android:go` with Expo Go).
4. Confirm you land on **Sign in (coming in Auth epic)**.
5. **In dev builds only** (`__DEV__`), check the **top banner**: it should show **Supabase: OK** after `getSession()` runs, or a clear **missing env** / **error** message — there should be **no unhandled promise rejection** in Metro/logs from this check.
6. Tap **Go to Library**, then **Open reader (test-book)** and confirm **`bookId`** shows `test-book`.
7. Use the **system back** gesture or button until you exit or return to the sign-in screen without getting stuck.

## Troubleshooting

- **Metro acting weird:** from `apps/mobile`, try `npx expo start --clear` (clears Metro cache) before re-running Android.
- **Gradle / Android build failures:** in `apps/mobile/android` (after prebuild), `./gradlew clean` can help; you can also remove `apps/mobile/android` and re-run `npx expo prebuild` if you know you need a clean native tree (coordinate with teammates—this is destructive to local native changes).
- **Windows path length / antivirus:** if builds fail with obscure file errors, shorten the clone path and exclude the repo from aggressive real-time scanning (common Android + Windows pain point).
