---
description: Check memory system health — node count, warnings, pending operations
---

# /memory-status

Check the health and status of your graph memory system.

## Instructions

1. Call `graph_memory` with action `status` to get the current system state.
2. Present the results in a clear, readable format:
   - Whether memory is initialized
   - Runtime mode and runtime details
   - Active project
   - Node count and pending dreams
   - Queue activity (`queuedJobs`, `runningJobs`, `scribePending`, `consolidationPending`)
   - Any warnings (MAP budget, decay risk, etc.)
3. If `firstRun` is true, suggest running `/memory-onboard` to set up memory.
4. If there are warnings, briefly explain what they mean and any recommended actions.
