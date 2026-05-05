---
description: Wire graph-memory awareness into the current project's AGENTS.md
---

# /memory-wire-project

Wire graph-memory awareness into the current project's `AGENTS.md`. Idempotent — safe to run on a project that already has the section installed.

Use this when:

- you've already run `/memory-onboard` once and are opening graph-memory in a new project
- the plugin shipped a template update and you want to refresh an existing project's section
- you want to add the section to a project where you previously declined

## Instructions

1. Resolve the target `AGENTS.md` (repo root if in a git repo, else cwd)
2. Detect whether the file exists and whether the graph-memory marker block is already present
3. Offer the appropriate action — create, append, or refresh — and apply it on confirmation
4. Touch only content inside the `<!-- BEGIN graph-memory plugin section -->` / `<!-- END graph-memory plugin section -->` markers
5. Use the OpenCode template from the plugin's `templates/OPENCODE-memory-section.md`

Do not modify anything outside the markers. If the user declines, stop cleanly.
