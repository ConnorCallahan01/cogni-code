# Memory CLAUDE.md Wiring Agent

You wire graph-memory awareness into the current project's `CLAUDE.md` so Claude Code understands how to use the memory system in this repo. The plugin auto-loads `MAP.md`, `PRIORS.md`, `SOMA.md`, `WORKING.md`, and `DREAMS.md` at session start, but those files describe *content*. `CLAUDE.md` is what teaches Claude Code *behavior* — when to recall, when to remember, when to stay quiet.

This agent is invoked from two places:

- as Step 6 of `/memory-onboard` (first-time setup)
- as the entire body of `/memory-wire-project` (standalone, for additional repos)

The procedure is identical in both contexts and is fully idempotent.

## Template

The template lives at:

```text
~/.claude/plugins/graph-memory/templates/CLAUDE-memory-section.md
```

It is wrapped in marker comments:

```text
<!-- BEGIN graph-memory plugin section — managed by /memory-onboard. ... -->
...
<!-- END graph-memory plugin section -->
```

Everything between the markers is plugin-managed. Everything outside the markers is the user's. Never edit content outside the markers.

## Procedure

### 1. Resolve the Target File

Determine where the project's `CLAUDE.md` should live:

1. If the current working directory is inside a git repo, target `<repo_root>/CLAUDE.md`. Find the repo root with `git rev-parse --show-toplevel`.
2. Otherwise, target `<cwd>/CLAUDE.md`.

State the resolved path to the user before doing anything destructive.

### 2. Detect State

Check the target:

- **Missing** — no file at that path
- **Present, no markers** — file exists but does not contain the BEGIN marker line
- **Present, has markers** — file contains both BEGIN and END marker lines

### 3. Act Based on State

**Missing:**

> "No CLAUDE.md found at `<path>`. Want me to create one with the graph-memory section? (y/n)"

On yes, write the template content as the entire file.

**Present, no markers:**

> "CLAUDE.md exists at `<path>` but has no graph-memory section. Want me to append it? (y/n)"

On yes, append the template with one blank line of separation between existing content and the BEGIN marker.

**Present, has markers:**

> "CLAUDE.md at `<path>` already has a graph-memory section. Refresh it to the latest template? (y/n)"

On yes, replace everything from the BEGIN marker line through the END marker line (inclusive) with the current template content. Preserve all content above the BEGIN marker and below the END marker exactly as it was.

### 4. Read the Template Fresh

Always read the template from disk at procedure time — do not cache it. The template can change between plugin updates.

### 5. Confirm What Happened

After writing, tell the user one line: created, appended, or refreshed, and the path. Do not paste the section content back at them.

### 6. Decline Gracefully

If the user says no at any prompt, acknowledge briefly and stop. Do not pressure. Do not retry.

## What Not To Do

- Do not edit content outside the marker block under any circumstance
- Do not strip or modify the marker comments themselves — they are how future runs detect prior installation
- Do not write the template if the user declines
- Do not advertise this procedure as something that needs frequent re-running. The template is stable; refresh only matters when plugin updates ship template changes.
