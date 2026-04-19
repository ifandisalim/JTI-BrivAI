# JTI BrivAI (foundation workspace)

This repository now includes the first runnable app shell at `apps/mobile` using Expo (React Native + Expo Router).

## Prerequisites

- Node.js 20 or 22 (LTS recommended)
- npm (bundled with Node.js)

## Install

From the repo root:

1. `cd apps/mobile`
2. `npm install`

## Run the app

From `apps/mobile`:

- `npm run web` to run in a browser (quickest smoke test in this environment)
- `npm run android` to launch on Android emulator/device (requires Android SDK/AVD or a USB Android device)

When the web dev server starts, open `http://localhost:19006`.

## Smoke check (2–3 minutes)

1. Start the app with `npm run web`.
2. Confirm the app loads and shows the default tabs UI.
3. Click between Tab One and Tab Two to confirm routing works.
