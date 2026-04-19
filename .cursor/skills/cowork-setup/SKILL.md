---
name: cowork-setup
description: First-time Cowork workspace setup — creates `01 Daily Logs/` and `02 Projects/`, interviews the user, and writes `CLAUDE.md` for cross-session memory. Trigger when the user asks for setup, first-time workspace setup, "run cowork setup", "cowork starter pack", or `/setup`, or when CLAUDE.md is missing and they want the daily workflow. If CLAUDE.md already exists, do not re-run; point them to help or new project instead.
---

# Cowork workspace setup

First-time setup for this repo's Cowork-style workflow: folder structure, a short interview, and a root `CLAUDE.md` so future sessions stay oriented.

## Step 1 — Check if already set up

If `CLAUDE.md` exists in the workspace root, tell the user they are already set up. Suggest saying **help** or **new project**. Do not recreate folders or overwrite `CLAUDE.md` without explicit permission.

## Step 2 — Create the folder structure

Create:

```
01 Daily Logs/
02 Projects/
```

`01 Daily Logs/` holds end-of-day session logs. `02 Projects/` holds one folder per project.

## Step 3 — Interview the user

Run this as a conversation, not a long form. Prefer the **AskQuestion** tool when it is available (structured choices plus free text). If it is not available, ask in **three small batches** and wait for replies between batches.

### Round 1 — Who are you?

1. **Name**
2. **What you do** — suggest options where helpful: full-time, freelance/self-employed, student, side project, other (type your own)

### Round 2 — What you need and tone

3. **What you want help with** — e.g. organizing work, writing, research, exploring
4. **Vibe** — casual, professional, direct/no-nonsense, or their own words

### Round 3 — Timezone

5. **Timezone** — offer common regions if useful; they can type any IANA or informal label

## Step 4 — Build CLAUDE.md

Create `CLAUDE.md` at the workspace root using their answers. Use this template and fill in the bracketed parts:

```markdown
# My Workspace — Context File

The assistant reads this file at the start of sessions. It is persistent memory for this workspace.

---

## How This Workspace Works

This workspace exists to produce things, not only store them. One loop: **set a goal → break it into problems → solve those problems → ship the output.**

Keep the user moving through that loop. If there is no goal yet, help set one. If there is a goal but no clear problems, help break it down. If there are problems, help with the next concrete action.

---

## Who I Am

**Name:** [their name]
**What I do:** [their answer]
**What I want help with:** [their answer, or still exploring]
**Vibe:** [their vibe]
**Timezone:** [their timezone]

---

## Folder Structure

```
01 Daily Logs/        — session logs (end of day)
02 Projects/          — one folder per project
```

---

## Active Projects

*(No projects yet — say "new project" to create your first one.)*

---

## What the assistant should do

- Match the user's vibe: [short tone instruction from their vibe answer]
- Put project outputs under the right project folder in `02 Projects/`. Ask if placement is unclear.
- Read the project overview before deep work on a project.
- When creating files for the user, prefix with `[C]` so they know the assistant created them (example: `[C] Research Notes.md`).

## What the assistant should not do

- Do not edit the user's personal notes without asking. Treat `[C]` files as assistant-owned unless the user says otherwise.
- Do not pad answers; stay direct and concrete.

---

## Skills and phrases

| Say this | What happens |
|---|---|
| "workspace setup" | First-time setup (you already did this if this file exists) |
| "new project" | Interview, project folder, overview, register here |
| "good morning" | Recap recent logs, recommend focus, pick next work |
| "end of day" / "wrap up" | Write today's log in `01 Daily Logs/` |
| "help" | List what you can do |

---

*Update this file as the workspace grows. The user may edit it anytime.*
```

## Step 5 — Optional Getting Started PDF

If the user wants a PDF and Python is available:

1. Install dependency: `pip install reportlab`
2. From the workspace root, run:

```bash
python .cursor/skills/cowork-setup/scripts/generate_getting_started.py "Getting Started.pdf"
```

If `reportlab` or Python is missing, skip this step and mention the Markdown flow in `CLAUDE.md` is enough.

## Step 6 — Confirm and suggest first projects

Confirm:

- Folders exist
- `CLAUDE.md` is in place for future sessions
- PDF only if it was generated

Then suggest **2–3 concrete first projects** tailored to what they said (not generic). Number them. If they pick one, move into the **new-project** skill and reuse answers you already have instead of re-asking.
