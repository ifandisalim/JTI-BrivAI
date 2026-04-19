# Cowork Starter Pack

Go from zero to a working Claude Cowork setup in 5 minutes.

## What This Plugin Does

This plugin gives you a complete workspace system out of the box. It teaches Claude who you are, what you're working on, and how to help you — then keeps that memory across every session.

The core idea: **set a goal, break it into problems, solve the problems, ship the output.** Every piece of this plugin is designed to keep you moving through that loop.

## Commands

### /setup
First thing you run. Type `/setup` and Claude interviews you in a quick back-and-forth conversation (name, what you do, what you want help with, your preferred vibe, timezone), then creates your folder structure and a CLAUDE.md file that acts as Claude's persistent memory. Only needs to be run once.

## Skills

### New Project
**Say:** "new project", "start a project", "create a project"

Claude interviews you about your project (goal, why, outcomes, problems to solve), creates a project folder with an overview file, and registers it in CLAUDE.md so every future session knows about it.

### Good Morning
**Say:** "good morning", "let's get to work", "start my day"

Claude reads your recent session logs, recaps what you've been working on, makes a recommendation on what's most important, and helps you pick what to tackle.

### End of Day
**Say:** "end of day", "wrap up", "we're done for today"

Claude logs everything from your session — what you worked on, what was built, what's still open, and where to start tomorrow. This is what bridges one session to the next.

### Help
**Say:** "help", "what can you do?", "what can I say?"

Shows you everything Claude can help with in plain language. Useful right after setup when you're not sure what to do next.

## How It Works

The plugin creates two things in your workspace:

1. **CLAUDE.md** — A file Claude reads at the start of every session. It contains who you are, your projects, and instructions for how Claude should work with you. This is your persistent memory.

2. **A simple folder structure:**
   - `01 Daily Logs/` — Session logs so Claude remembers what you worked on
   - `02 Projects/` — One folder per project, each with an overview file

## Getting Started

1. Install the plugin
2. Select a folder for your workspace
3. Type `/setup`
4. Answer a few quick questions
5. Say "new project" to create your first project

That's it. You're up and running.
