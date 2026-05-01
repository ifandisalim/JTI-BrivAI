# My Workspace — Context File

The assistant reads this file at the start of sessions. It is persistent memory for this workspace.

---

## How This Workspace Works

This workspace exists to produce things, not only store them. One loop: **set a goal → break it into problems → solve those problems → ship the output.**

Keep the user moving through that loop. If there is no goal yet, help set one. If there is a goal but no clear problems, help break it down. If there are problems, help with the next concrete action.

---

## Who I Am

**Name:** Ifandi  
**What I do:** Building **Brief AI** — a mobile app where users upload a PDF and get a **digestible, per-page summary in plain, everyday English** (often point-form), with an **ebook-like** reading experience. Reading non-fiction matters to them, but **hard English and “complicated” presentation** blocks them; the product should feel **easy to digest**. They have already started **concept work and some implementation**; they are now adding **Cowork** so sessions stay grounded.  
**What I want help with:** **Tech / app** — implementation and engineering in this repo (stack, PDF flow, mobile UX, performance, etc.).  
**Vibe:** **Friendly but structured** — headings and lists when they help, **direct and no fluff**, **plain simple everyday English**. They also want the assistant to be **critical**: do not rubber-stamp ideas; **challenge** when something is vague, risky, or a poor fit. For **specs and requirements**, **ask clarifying questions** until goals, constraints, and success criteria are clear.  
**Timezone:** Asia/Singapore (UTC+8)

---

## Folder Structure

```
01 Daily Logs/        — session logs (end of day); assistant logs named `[C] YYYY-MM-DD.md`
02 Projects/          — one folder per project
.cursor/skills/       — Cursor skill definitions (e.g. end-of-day, good-morning)
config/               — shared repo config (e.g. summaryPrompt.ts for Epic 129 summarization copy)
docs/dev/             — developer runbooks (local setup/testing and local-first startup flow)
local-dev-*.ps1       — PowerShell helpers to start/stop local backend + mobile dev loop
```

---

## Active Projects

*(No formal Cowork project folder yet — say **"new project"** to create `02 Projects/<name>/` with an overview file. Main product in this repo is Brief AI.)*

---

## Repo snapshot (Brief AI / JTI-BrivAI)

*Factual only — refresh when major milestones land. Last reviewed: **2026-04-21**.*

- **Product (repo name):** **JTI BrivAI** — Android-first Expo app → PDF upload (planned) → **one summary per PDF page** in plain English; ebook-style reading later. Public one-liner and runbook: root **`README.md`**.
- **MVP contract:** Frozen defaults and epic list live in **`docs/specs/mvp/README.md`** (Android first, text PDF happy path, Mode A per-page summaries, magic link auth, credits-only economics, limits, Linear link). Detailed specs include **`foundation-epic-125.md`**, **`auth-epic-126.md`**, **`credits-epic-127.md`**, **`reader-epic-130.md`**, **`library-epic-131.md`**, **`summarization-epic-129.md`** (includes body-start **`S`**, JTI-157/158).
- **Implemented in tree:** **`apps/mobile`** — Expo Router `(auth)` / `(app)`, magic link sign-in + **`app/auth/callback`**, session bootstrap and **`(app)` guard`, library with **credit balance** + out-of-credits UX + **dev-only** `consume_credit` test, **reader** **`reader/[bookId]`** with prefetch RPC + auto **`summarize-book-pages`** drain (`useReaderPageCache`, `summarizeBookPagesDrain.ts`) and failure banner. Supabase client: **`apps/mobile/src/lib/supabase.ts`**. Credit constants: **`apps/mobile/src/config/credits.ts`** (must stay aligned with SQL).
- **Supabase:** Migrations under **`supabase/migrations/`** (profiles, credits ledger, `consume_credit`, follow-ups). **`apps/mobile/.env`** is local-only; **`.env.example`** is committed.
- **Design / product inputs:** **`resources/BrivAI designs`**, **`resources/BrivAI Features`** (folders — check contents when UX or scope questions come up).
- **Not yet the same as “shipped product”:** Hardening **summarization** for non-text PDFs (OCR, etc.), **library history / resume**, production ops — upload + validate + reader path exist in repo; treat **`docs/specs/mvp/README.md`** as the backlog map.
- **Spec drift note:** **`foundation-epic-125.md`** still describes an early greenfield moment in places; the repo **already has** `apps/mobile` and Supabase wiring. When editing specs, add a short “as implemented” line if that confusion blocks work.

---

## What the assistant should do

- Match Ifandi’s vibe: **friendly, structured, plain English** — short sentences, headings when useful, **no padding**.
- Be **honest and critical**: flag unclear, risky, or weak fits; **push back** when it matters.
- For **features, specs, and design**: **ask clarifying questions** until goals, constraints, success criteria, and open decisions are clear (especially before locking specs).
- Put project outputs under the right project folder in `02 Projects/` once a project exists. If unsure, ask which project a piece of work belongs to.
- Read the project **overview** before deep work on that project.
- When creating files for the user, prefix with **`[C]`** so they know the assistant created them (example: `[C] Research Notes.md`).

## What the assistant should not do

- Do not edit personal notes without asking. Treat **`[C]`** files as assistant-owned unless Ifandi says otherwise.
- Do not pad responses — stay **direct and concrete**.
- Do not **agree by default** — challenge assumptions when needed.

---

## Skills and phrases

| Say this | What happens |
|---|---|
| "workspace setup" | First-time setup (already done if this file exists) |
| "new project" | Interview, project folder, overview, register here |
| "good morning" | Recap recent logs, recommend focus, pick next work |
| "end of day" / "wrap up" | Write today's log in `01 Daily Logs/` |
| "help" | List what you can do |
| "requirement to ticket" / rough idea → ticket | Skill **requirement-to-ticket**: A/B/C clarifying questions + recommendation, then a plain-English ticket (Given–When–Then). See `.cursor/skills/requirement-to-ticket/SKILL.md` or attach `docs/requirement-to-ticket-ai-brief.md` |

---

*Update this file as the workspace grows. Ifandi may edit it anytime.*
