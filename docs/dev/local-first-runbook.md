# Local-first runbook (backend + mobile, Windows)

This guide is the **fast local debugging path** for this repo.

Goal:
- run Supabase backend locally (database, auth, storage, edge runtime)
- run mobile app locally with local backend credentials
- keep setup scriptable so an AI agent can execute commands reliably

This guide is Windows/PowerShell-first, but the same concepts apply on macOS/Linux.

---

## 1) What is possible today

Yes, you can run almost everything locally today.

- **Mobile app local:** yes (`apps/mobile`, Expo).
- **Supabase backend local:** yes (`supabase start` + migrations + functions serve).
- **Summarization fully offline:** not yet by default.
  - Current function code calls OpenAI for summary generation.
  - You can still run locally by setting `OPENAI_API_KEY` in function env.

---

## 2) One-command workflow

This repo now includes:

- `local-dev-up.ps1` — starts local backend, prepares function env, starts edge function server, then starts mobile app.
- `local-dev-down.ps1` — stops function server and local Supabase stack.

### Quick start (daily use)

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1"
```

Default mobile target is Expo Go on Android (`npm run android:go`).

When done:

```powershell
powershell -ExecutionPolicy Bypass -File ".\local-dev-down.ps1"
```

### Choose mobile target

```powershell
# Expo Go (fastest loop)
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -MobileTarget go

# Native dev build
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -MobileTarget android

# Web smoke testing
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -MobileTarget web
```

---

## 3) First-time machine setup (one-time)

Install:

- Docker Desktop (must be running before `supabase start`)
- Supabase CLI (`supabase --version`)
- Node.js LTS 20.x or 22.x (`node -v`)
- npm (`npm -v`)
- Android Studio + SDK + emulator (for Android testing)
- JDK 17 (usually bundled with Android Studio)

Optional but useful:

- `adb` on PATH

---

## 4) First local bootstrap (recommended once)

Run these once from repo root:

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI"
supabase start
supabase db reset
```

What this does:
- starts local Supabase Docker services
- applies all migrations from `supabase/migrations`
- applies `supabase/seed.sql`

After this, the local database schema should match the repo migrations.

---

## 5) Function secrets and OpenAI behavior

`local-dev-up.ps1` writes `supabase/.env.local` automatically with:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (from your current shell env, if set)
- `OPENAI_SUMMARY_MODEL` (defaults to `gpt-4o-mini`)

Important:
- `supabase/.env.local` is gitignored. Keep secrets there only.
- If `OPENAI_API_KEY` is empty, summary-related flows can fail (expected).

Before running `local-dev-up.ps1`, set key in current terminal if needed:

```powershell
$env:OPENAI_API_KEY="YOUR_OPENAI_KEY"
```

---

## 6) How the one-command script works

`local-dev-up.ps1` sequence:

1. `supabase start`
2. reads local credentials from `supabase status`
3. writes `supabase/.env.local`
4. starts `supabase functions serve --env-file supabase/.env.local` in background
5. exports Expo env for this process:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. installs `apps/mobile` dependencies if missing
7. starts Expo (`android:go`, `android`, or `web`)

This gives one command for “backend up + app running”.

---

## 7) AI-agent friendly command blocks

Use these exact command blocks in order.

### A. Full local start (one command)

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI"
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1"
```

### B. Start with native Android dev build

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI"
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -MobileTarget android
```

### C. Start without re-running Supabase start

Useful when containers are already healthy:

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI"
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -SkipSupabaseStart
```

### D. Shutdown everything

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI"
powershell -ExecutionPolicy Bypass -File ".\local-dev-down.ps1"
```

---

## 8) Smoke checklist (local stack)

After startup:

1. App opens on emulator/phone.
2. Sign-in screen loads without red screen.
3. Move to library, then reader (`test-book`) path.
4. Upload flow reaches server validation path (for PDF flow tests).
5. Reader attempts summary flow (requires OpenAI key for real summaries).
6. No repeated “missing env” message from Supabase client.

---

## 9) Known limits of one-command flow

One command can start the software stack, but a few things may still need manual action:

- Android emulator may need to be started manually first.
- First native build (`-MobileTarget android`) can take several minutes.
- If Docker is stopped, Supabase local cannot boot.
- If OpenAI key is missing/invalid, summarization paths fail by design.

So: **one command works for startup orchestration**, but it cannot bypass external prerequisites.

---

## 10) Troubleshooting

### `supabase start` fails

- Ensure Docker Desktop is running.
- Retry:

```powershell
supabase stop
supabase start
```

### Functions are not responding

- Restart using down/up scripts:

```powershell
powershell -ExecutionPolicy Bypass -File ".\local-dev-down.ps1"
powershell -ExecutionPolicy Bypass -File ".\local-dev-up.ps1" -SkipSupabaseStart
```

### Expo uses old env values

- Restart Expo with clean cache:

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI\apps\mobile"
npx expo start --clear
```

### Android build issues

- Try Expo Go first (`-MobileTarget go`) to isolate native build issues.
- For native Gradle issues:

```powershell
cd "D:\Work\Arbit Bot\DEV\JTI-BrivAI\apps\mobile\android"
.\gradlew clean
```

---

## 11) Recommended team workflow

For fastest debugging:

1. Use this local-first runbook for daily development.
2. Keep cloud Supabase for staging and final integration checks.
3. If summarization cost/speed becomes a blocker, add a dedicated mock summarizer mode in Edge Functions for local-only development.

