---
description: First-time workspace setup — creates folders, interviews the user, and builds CLAUDE.md
---

First-time setup for a new Cowork workspace. This creates the folder structure, interviews the user about who they are, and builds a CLAUDE.md context file so Claude remembers everything across sessions.

## Step 1 — Check if already set up

Before doing anything, check if a CLAUDE.md file already exists in the workspace root. If it does, tell the user: "You're already set up! Say 'help' if you want to see what I can do, or 'new project' to start a new project." Do not re-run setup.

## Step 2 — Create the folder structure

Create these folders in the user's workspace:

```
01 Daily Logs/
02 Projects/
```

`01 Daily Logs` is where session logs go. `02 Projects` is where all project folders will live.

## Step 3 — Interview the user (3 rounds)

This interview happens as a conversation, not a form. Ask questions in small batches so it feels like a real back-and-forth. Wait for the user's response after each round before moving to the next.

IMPORTANT: Always use the AskUserQuestion tool (not plain text questions) for each round. This gives the user a clean, structured interface to respond. Each question in AskUserQuestion should have a few suggested options so the user can pick one or type their own answer.

### Round 1 — Who are you?
Use AskUserQuestion with two questions:
1. **Name** — "What's your name?" (no options needed — they'll type it)
2. **What you do** — "What do you do?" with options like: "Work full-time", "Freelance/self-employed", "Student", "Building a side project". They can always type their own answer.

Wait for their response.

### Round 2 — What do you need and how should I show up?
Use AskUserQuestion with two questions:
3. **What you want help with** — "What are you hoping I can help you with?" with options like: "Organizing my work/projects", "Writing and creating content", "Research and problem-solving", "Not sure yet — just exploring". They can always type their own answer.
4. **Vibe** — "How do you like your help served?" with options like: "Casual and chill", "Professional and polished", "Direct and no-nonsense".

Wait for their response.

### Round 3 — Timezone
Use AskUserQuestion with one question:
5. **Timezone** — "What timezone are you in?" with options like: "Eastern (ET)", "Central (CT)", "Mountain (MT)", "Pacific (PT)". They can type their own if they're outside the US.

Wait for their response, then move to Step 4.

## Step 4 — Build CLAUDE.md

Using their answers, create a `CLAUDE.md` file in the root of their workspace. This is the most important file — it's what makes Claude "remember" them.

Use this exact template, filling in their answers:

```markdown
# My Workspace — Claude Context File

Claude reads this file at the start of every session. It's your persistent memory.

---

## How This Workspace Works

This workspace exists to produce things, not just store things. Everything here is oriented around one loop: **set a goal → break it into problems → solve those problems → ship the output.**

Claude's job is to keep the user moving through that loop. If there's no goal yet, help them set one. If there's a goal but no clear problems, help them break it down. If there are problems, help them solve the next one. Always push toward the next concrete thing to make or do.

---

## Who I Am

**Name:** [their name]
**What I do:** [their answer about work/life]
**What I want help with:** [their answer, or "Still exploring — Claude should suggest ways to help as we work together." if they weren't sure]
**Vibe:** [their vibe answer — e.g. "Casual and direct", "Professional but warm", etc.]
**Timezone:** [their timezone]

---

## Folder Structure

```
01 Daily Logs/        — session logs so Claude remembers what we worked on
02 Projects/          — one folder per project
```

---

## Active Projects

*(No projects yet — say "new project" to create your first one.)*

---

## What Claude Should Do

- Match my vibe: [write a short tone instruction based on their vibe answer — e.g. "Keep it casual, skip the formalities" or "Stay professional but friendly" or "Be direct, don't sugarcoat things"]
- Put outputs for each project in the right project folder. If you're not sure where something belongs, ask which project it applies to.
- Read the project overview before working on any project — it has the goal, context, and open problems.
- When creating files, prefix the filename with [C] so I know Claude made it (e.g., `[C] Research Notes.md`).

## What Claude Should NOT Do

- Don't edit my notes without asking first. Only files with the [C] prefix are Claude's to freely edit.
- Don't pad responses — be direct and concrete.

---

## Skills & Commands

Here's what you can ask me to do:

| Say this | What happens |
|---|---|
| `/setup` | First-time workspace setup (you already did this!) |
| "new project" | I'll interview you about the project and set up a folder with a project overview |
| "good morning" | I'll recap recent work, recommend what's most important, and help you pick what to do |
| "end of day" or "wrap up" | I'll log what we worked on so the next session can pick up where we left off |
| "help" or "what can you do?" | I'll show you everything I can help with |

---

*Claude updates this file as your workspace grows. You can also edit it yourself anytime.*
```

## Step 5 — Generate the Getting Started PDF

Run the bundled script to create a "Getting Started" PDF in the user's workspace root:

```bash
pip install reportlab --break-system-packages -q 2>/dev/null
python ${CLAUDE_PLUGIN_ROOT}/commands/scripts/generate_getting_started.py "<workspace_path>/Getting Started.pdf"
```

Replace `<workspace_path>` with the actual path to the user's workspace folder. This creates a clean 3-page PDF that explains how the workspace works, what they can say, and tips for getting the most out of it.

## Step 6 — Confirm and suggest first projects

After creating everything, give the user a short confirmation:

- Their workspace is set up
- CLAUDE.md is live — Claude will read it at the start of every future session
- A "Getting Started" PDF is in their workspace if they ever need a reference

Then — and this is important — use what you learned in the interview to suggest 2-3 specific projects they could start with. Don't be generic. Use their actual work, goals, and what they said they want help with to propose concrete projects with real problems to solve.

Format it as a numbered list they can pick from. Each suggestion should have a project name and a one-line description of the first problem it would tackle. For example, if someone said they're a freelance designer who wants help with proposals:

> Here are a few projects we could kick off based on what you told me — pick one, or tell me something different:
>
> 1. **Client Proposal System** — figure out a repeatable template so you stop writing proposals from scratch every time
> 2. **Pricing Strategy** — nail down how to price your work so you're profitable and confident quoting clients
> 3. **Client Onboarding** — build a smooth process for bringing new clients in so nothing falls through the cracks

Don't use that exact example — tailor it entirely to what this specific person told you. The suggestions should feel like you were actually listening.

If they pick one, immediately transition into the new-project skill flow — but you can pre-fill some of the interview answers from context you already have. Don't re-ask things they already told you.

If they say "none of those" or want something different, just ask what they'd like to work on instead and run the new-project skill normally.
