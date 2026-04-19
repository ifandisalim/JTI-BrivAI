# Spec: Authentication (Epic 126)

**Linear**

- Epic: **[JTI-126](https://linear.app/jtienterprise/issue/JTI-126/epic-authentication)** — Authentication  
- Issue: **[JTI-135](https://linear.app/jtienterprise/issue/JTI-135/mvp-auth-01-email-magic-link-sign-in-ux)** — Email magic link sign-in UX  
- Issue: **[JTI-136](https://linear.app/jtienterprise/issue/JTI-136/mvp-auth-02-session-persistence-and-sign-out)** — Session persistence and sign out  

**Purpose**

This document is the **implementation-grade** spec for **Supabase email magic link** authentication on the **Android-first Expo** app, plus a **`profiles`** row per user for later epics (credits, uploads, library). It replaces placeholder navigation on the sign-in screen and introduces a **real auth gate** so cold starts behave correctly.

**Hard dependencies (must already be true)**

- **JTI-133 / JTI-134 complete:** `apps/mobile` runs on Android; `apps/mobile/src/lib/supabase.ts` exists with **AsyncStorage** session persistence, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` (correct for React Native).  
- **`apps/mobile/app.json`** defines Expo **`scheme`: `brivai`** (already true in repo) for deep links.  
- Supabase **dev project** exists; **anon** key is in `apps/mobile/.env` (never commit real keys).

---

## 1. Product intent (plain English)

Users sign in with **email only** (no password in MVP). They receive a **magic link** email from Supabase. After they tap the link, the app opens (or comes to foreground), establishes a session, and they can use **Library** and the rest of the app. After they restart the phone or force-close the app, they should still be signed in until they explicitly **sign out**.

**Out of scope for Epic 126**

- Google / Apple social login (PA1 unless reprioritized).  
- Password auth, MFA, phone OTP.  
- “Forgot email” recovery UX beyond what Supabase emails provide.  
- In-app “account settings” screens (not required for MVP).  
- **Row data** for credits/books/summaries (those epics create tables later)—this epic only guarantees **`auth.users` + `public.profiles`**.

---

## 2. Supabase Dashboard configuration (normative checklist)

Complete these in the Supabase dashboard for the **same** project referenced by `EXPO_PUBLIC_SUPABASE_*`.

| Setting | What to do | Why |
|--------|------------|-----|
| **Authentication → Providers → Email** | Enable **Email**. Decide whether **“Confirm email”** is required for sign-in; for fastest MVP loops, many teams use magic link without extra confirmation—**pick one** and document it in the PR. | Magic link is an email provider feature. |
| **Authentication → URL configuration → Site URL** | Set to a sensible default for dev (can be `http://localhost:3000` if you do not use it; magic link still works if **Redirect URLs** are correct). Supabase requires a value. | Supabase validates redirects against allow list. |
| **Authentication → URL configuration → Redirect URLs** | Add **every** redirect you will pass to `signInWithOtp` as `emailRedirectTo`, including **Expo dev** variants. | Wrong allow list = “redirect not allowed” errors. |

**Redirect URL rule (normative)**

Use Expo’s URL helper so you do not hardcode hostnames:

- In the app, build `emailRedirectTo` using **`expo-linking`** (see section 6.2).  
- Copy the **exact resolved string** from a dev log (`console.log`) and add it to **Redirect URLs** in Supabase the first time you see a mismatch error.

**Email template (optional for MVP quality)**

- Supabase → Authentication → Email templates → **Magic Link**.  
- Ensure the sent link points to your app’s deep link / universal link strategy (Supabase default may assume web). If testers open email on desktop, the link may open browser—**acceptable for MVP** if documented; primary test path is **email opened on the phone**.

---

## 3. Database: `public.profiles` (normative)

### 3.1 Why

Later features need a stable **`user_id`** and optional profile fields. `auth.users` is not exposed to the client under normal RLS patterns for arbitrary queries; a thin **`public.profiles`** table is the standard Supabase pattern.

### 3.2 Migration (source of truth)

Apply the SQL in the repo migration file:

- `supabase/migrations/20260419140000_auth_profiles.sql` (**do not edit** after it has been applied to a shared environment—add a **new** migration for policy changes).

**Normative behavior**

- On **`auth.users` insert**, a matching **`public.profiles`** row is created (`id` = user id).  
- **RLS enabled** on `profiles`.  
- A user can **read** their own profile row.  
- **Updates** to own profile are allowed for MVP (even if unused yet)—keeps future “display name” work simple.

### 3.3 Credits epic handoff (non-blocking for 126)

Credits tables will FK to **`auth.users`** or **`profiles.id`** later—pick one style and stick to it in the Credits spec. This Auth spec only requires **`profiles.id` = `auth.users.id`**.

---

<a id="jti-126"></a>

## 4. Epic JTI-126 — acceptance criteria (whole epic “done”)

Epic 126 is complete when **all** are true:

1. **Magic link sign-in** works on Android for a normal email inbox on the same device (JTI-135).  
2. **Cold start** returns a signed-in user to the **authenticated experience** without requiring a new email (JTI-136).  
3. **Sign out** returns the user to the **sign-in** flow and clears local session artifacts (JTI-136).  
4. **`public.profiles`** row exists for each new user after first sign-in (migration + trigger).  
5. **Placeholder bypass** is removed: users cannot reach **`(app)`** routes without a session (JTI-135/136 together).

---

<a id="jti-135"></a>

## 5. JTI-135 — Email magic link sign-in UX

### 5.1 Goal

Replace the temporary “Go to Library” shortcut on `app/(auth)/sign-in.tsx` with a real **email + send magic link** flow using `supabase.auth.signInWithOtp`.

### 5.2 UX requirements (normative)

| Element | Requirement |
|--------|----------------|
| **Email input** | Single field, keyboard type email, trim whitespace, lowercase optional (be consistent). |
| **Submit** | Button “Email me a link” (or equivalent). Disabled while request in-flight. |
| **Loading** | Show inline loading on the button or a small spinner text (“Sending link…”). |
| **Success** | Non-alarming confirmation: “Check your email for a sign-in link.” |
| **Errors** | User-readable messages for: empty email, invalid format (client-side), Supabase rate limit / generic failures (map `error.message` to friendly text where safe). |
| **Supabase not configured** | Keep existing `isSupabaseConfigured()` guard; block submit with the same configuration warning pattern already in the screen. |

### 5.3 Technical flow (normative)

1. **Build `emailRedirectTo`** using `Linking.createURL` from `expo-linking` (import `* as Linking from 'expo-linking'`).  
   - Example path segment: `'auth/callback'` (final string must match a route you implement—see 5.4).  
2. Call **`supabase.auth.signInWithOtp`** with:

   - `email`  
   - `options.emailRedirectTo` set to the URL from step 1  

3. Handle promise result; surface errors per 5.2.

**Important:** `supabase` may be `null` when not configured—guard every call.

### 5.4 Callback route (normative)

Implement a dedicated route that magic links can land on, for example:

- `apps/mobile/app/auth/callback.tsx` **(recommended, outside `(auth)` group)** so it is not wrapped by the same stack assumptions as sign-in.

**Callback responsibilities**

1. Parse incoming URL (query / fragment) using the **current Supabase + Expo recommended approach** for your `supabase-js` major version.  
2. Establish the session (`setSession` / `getSessionFromUrl` / equivalent per docs—**follow official Supabase React Native / Expo guide**, do not invent token parsing).  
3. On success: **`router.replace('/library')`** (or `/(app)/library`—use the canonical path your router expects).  
4. On failure: show a simple error UI + button “Back to sign in” → `router.replace('/sign-in')`.

**Expo Router wiring**

- Ensure the route is registered so `Linking.createURL('auth/callback')` resolves consistently.  
- Add `Stack.Screen` options if headers should be hidden for this transient screen.

### 5.5 Remove placeholder bypass (normative)

Delete the **`Link` → `/library`** shortcut from `sign-in.tsx` once magic link flow exists. **No hidden dev bypass** in production paths; if you need a dev-only bypass, gate with `__DEV__` and print a loud warning—prefer **not** having one.

### 5.6 JTI-135 acceptance criteria (testable)

**AC-135-1 — Send link**

- **Given** a valid Supabase configuration  
- **When** the user enters a valid email and taps submit  
- **Then** Supabase accepts the request and the UI shows the success state (and no unhandled rejection).

**AC-135-2 — Complete link on device**

- **Given** the user receives the magic link email on the Android device  
- **When** they tap the link  
- **Then** the app opens the callback handler and lands on **Library** with an authenticated session (`supabase.auth.getSession()` non-null).

**AC-135-3 — Failure modes**

- **Given** network failure or disallowed redirect  
- **When** the user attempts sign-in  
- **Then** they see a clear error and can retry without restarting the app.

---

<a id="jti-136"></a>

## 6. JTI-136 — Session persistence and sign out

### 6.1 Goal

Ensure **auth gates** match reality: authenticated users are not dumped on sign-in after reboot, and unauthenticated users cannot access `(app)` routes. Provide **sign out**.

### 6.2 Session resolution on cold start (normative)

Today `app/index.tsx` always redirects to `/sign-in`. Replace this with a **session-aware bootstrap**:

**Recommended pattern**

1. Add a lightweight **Auth provider** (React context) OR a dedicated hook `useAuthSession()` colocated under `apps/mobile/src/auth/` (pick one pattern; do not duplicate session state in three places).  
2. On app start, call **`supabase.auth.getSession()`** once, and subscribe to **`supabase.auth.onAuthStateChange`** for subsequent updates.  
3. While the initial session check is in-flight, render **splash/blank/loading** (no flash of sign-in for signed-in users).  
4. After resolution:

   - If session exists → `Redirect` to **`/library`** (or `/(app)/library`).  
   - If not → `Redirect` to **`/sign-in`**.

**Edge cases**

- **`supabase` is null** (not configured): keep behavior predictable—send user to sign-in with configuration warning, or show a dedicated “misconfigured app” screen (either is acceptable; document choice in PR).

### 6.3 Route protection (normative)

Prevent unauthenticated navigation into **`(app)`** group:

- Prefer **Expo Router layouts**: in `app/(app)/_layout.tsx`, if no session, redirect to `/sign-in`.  
- Ensure deep links cannot permanently strand an unauthenticated user in `(app)` without a way back.

### 6.4 Sign out (normative)

Expose **Sign out** in a predictable MVP location:

- **Minimum:** button on **Library** screen header (right header button is fine).  
- Call **`supabase.auth.signOut()`**, await completion, then route to **`/sign-in`**.  
- Clear any **client-side caches** you add later (not required for 126 unless you introduce them).

### 6.5 JTI-136 acceptance criteria (testable)

**AC-136-1 — Persist across restart**

- **Given** the user completed magic link sign-in  
- **When** they force-close the app and reopen  
- **Then** they land in the **authenticated** experience (Library) without repeating email OTP **until** token expiry policies say otherwise (document Supabase defaults used).

**AC-136-2 — Sign out**

- **Given** a signed-in user  
- **When** they tap Sign out  
- **Then** session is cleared and they are returned to **sign-in**, and cannot access `(app)` without signing in again.

**AC-136-3 — Unauthenticated access**

- **Given** no session  
- **When** the user attempts to open `/library` manually (deep link / devtools)  
- **Then** they are redirected to **`/sign-in`** (or equivalent guard).

---

## 7. Implementation order (normative)

1. **Land DB migration** (`profiles` + trigger + RLS) and verify in Supabase Table Editor.  
2. **JTI-135:** magic link UX + callback route + remove placeholder `Link`.  
3. **JTI-136:** session bootstrap + `(app)` guard + sign out.  

You may **open PRs per issue** or one combined PR if you prefer—Linear should still track both issues separately.

---

## 8. Manual test script (release gate for Epic 126)

1. Install dev build on Android device.  
2. Sign out if needed.  
3. Request magic link with a real email.  
4. Complete link from phone email client → lands Library.  
5. Kill app → reopen → still Library.  
6. Sign out → lands sign-in.  
7. Confirm **`profiles`** row exists for the user in Supabase.

---

## 9. Linear hygiene (keep tickets short)

Epic **JTI-126** should link to this file as the **detailed spec**. Issues **JTI-135** / **JTI-136** should link to `#jti-135` / `#jti-136` anchors in this document.

GitHub URL (after push to `main`):

`https://github.com/ifandisalim/JTI-BrivAI/blob/main/docs/specs/mvp/auth-epic-126.md`
