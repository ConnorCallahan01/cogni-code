---
name: memory-status
description: Check the health and status of the graph memory system. Use when the user asks about memory health, node counts, queue activity, or warnings.
---

# /memory-status

Check the health and status of the graph memory system.

## Instructions

1. Call `graph_memory(action="status")` to get the current system state.
2. Present the results in a clear, readable format:
   - Whether memory is initialized
   - Runtime mode and runtime details
   - Active project
   - Node count and pending dreams
   - Queue activity (`queuedJobs`, `runningJobs`, `scribePending`, `consolidationPending`)
   - Any warnings (MAP budget, decay risk, etc.)
3. If `firstRun` is true, suggest initializing memory via `graph_memory(action="initialize")`.
4. If there are warnings, briefly explain what they mean and any recommended actions.
5. If Docker runtime is configured but the Docker state looks unhealthy, call that out explicitly.
