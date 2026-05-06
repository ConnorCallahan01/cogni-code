---
description: Morning kickoff from latest brief and current repo context
---

# /memory-morning-kickoff

Kick off the day from the latest morning brief and the current repo context.

## Instructions

1. Inspect current memory status with `graph_memory` action `status`
2. Read the latest 3 daily brief files from `<graphRoot>/briefs/daily/` when available, with the newest brief as the primary input
3. Use the current working directory as the primary repo context when it is a project repo
4. Read the current repo's `AGENTS.md` if present
5. Read the current project's working-memory artifact if present
6. Synthesize a concise morning kickoff for this repo that includes:
   - today's repo focus
   - the 3 highest-value tasks for today
   - the key risks / constraints to keep in mind
   - the memory or priors the agent should actively use
   - the recent multi-day trend that should influence today's plan
   - one "better engineer today" coaching move
   - a "Notes for the Agent" section that tells the agent how it should adapt today
   - one suggested first prompt the user can give to start well
7. If the repo context is ambiguous, ask one short clarification question instead of guessing wrong
8. Present the final kickoff in a clean ASCII terminal layout that is easy to scan
