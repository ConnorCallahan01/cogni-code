---
name: memory-morning-kickoff
description: Kick off the day with a repo-specific operating brief from the latest morning briefs, project context, and memory status. Use when the user wants to start their day or get caught up on what they were working on.
---

# /memory-morning-kickoff

Kick off the day from the latest morning briefs and the current repo context.

## Instructions

1. Call `graph_memory(action="status")` to confirm memory health and the active project.
2. Read the latest 3 daily brief files from the briefs directory (typically `<graphRoot>/briefs/daily/`). The newest brief is the primary input.
3. Identify the current repo context — use the current working directory as the default project repo.
4. Read the current repo's instruction file (CLAUDE.md, AGENTS.md, etc.) if present.
5. Check for a working-memory artifact (e.g., `WORKING.md` in the graph root).
6. Synthesize a concise morning kickoff that includes:
   - **Today's repo focus** — what the project needs today
   - **Top 3 tasks** — highest-value work for today
   - **Key risks / constraints** — what to watch out for
   - **Memory and priors to actively use** — which nodes or patterns matter most right now
   - **Multi-day trend** — what the last few days' briefs reveal about direction
   - **One "better engineer today" coaching move** — a concrete practice to apply
   - **Notes for the Agent** — how the AI should adapt behavior today
   - **Suggested first prompt** — one prompt the user can start with
7. Present the kickoff in a clean, scannable layout.

Use `graph_memory(action="recall", query="<current project or topic>")` to pull in relevant memory context alongside the briefs.
