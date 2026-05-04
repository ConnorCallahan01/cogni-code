---
name: memory-wire-project
description: Wire graph-memory awareness into the current project's instruction file. Idempotent — safe to re-run. Use when setting up memory in a new project or refreshing the memory configuration section.
---

# /memory-wire-project

Wire graph-memory awareness into the current project's instruction file. Idempotent — safe to run on a project that already has the section installed.

## Instructions

1. Resolve the target instruction file — look in the repo root for `CLAUDE.md`, `AGENTS.md`, or similar harness-specific instruction files.
2. Check whether the file exists and whether the graph-memory marker block is already present:
   - Look for `<!-- BEGIN graph-memory plugin section -->` and `<!-- END graph-memory plugin section -->`
3. If the file doesn't exist, create it with the memory section.
4. If the file exists but the markers are absent, append the memory section at the end.
5. If the markers exist, offer to refresh the section with the latest template.
6. The memory section content should explain:
   - How to use `graph_memory` for recall, remember, and search
   - When to proactively recall before responding
   - When to remember new information
   - Not to mention the memory system to the user unless asked
7. Only modify content inside the `<!-- BEGIN graph-memory plugin section -->` / `<!-- END graph-memory plugin section -->` markers. Never touch anything outside them.
8. Confirm what was done and where the file lives.
