# JTI BrivAI

BrivAI is becoming a mobile app for uploading PDFs and reading **page-by-page summaries** (MVP scope grows in product specs). This repo currently holds the **Android-first Expo shell** and foundation work.

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

## Environment variables

Supabase and other client env vars are introduced in **Linear JTI-134**. When that lands, copy **`apps/mobile/.env.example`** to **`apps/mobile/.env`** and fill in **public** values only (never commit real secrets or service role keys). Variables use the **`EXPO_PUBLIC_*`** prefix so Expo can inline them for the client.

## What “Foundation” means here (JTI-133)

- The app opens to the **sign-in placeholder** (auth-first entry).
- You can open the **library placeholder** and navigate to the **reader** with a dynamic **`bookId`** (try **`test-book`** from the library screen).
- Android **back** should walk the stack normally (Expo Router + native stack defaults).

## Smoke check (about 2 minutes)

1. Install dependencies (`cd apps/mobile && npm install`).
2. On Android: `npm run android` (or `npm run android:go` with Expo Go).
3. Confirm you land on **Sign in (coming in Auth epic)**.
4. Tap **Go to Library**, then **Open reader (test-book)** and confirm **`bookId`** shows `test-book`.
5. Use the **system back** gesture or button until you exit or return to the sign-in screen without getting stuck.

## Troubleshooting

- **Metro acting weird:** from `apps/mobile`, try `npx expo start --clear` (clears Metro cache) before re-running Android.
- **Gradle / Android build failures:** in `apps/mobile/android` (after prebuild), `./gradlew clean` can help; you can also remove `apps/mobile/android` and re-run `npx expo prebuild` if you know you need a clean native tree (coordinate with teammates—this is destructive to local native changes).
- **Windows path length / antivirus:** if builds fail with obscure file errors, shorten the clone path and exclude the repo from aggressive real-time scanning (common Android + Windows pain point).
