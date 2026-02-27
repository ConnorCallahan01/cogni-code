# /memory-status

Check the health and status of your graph memory system.

## Instructions

1. Call `graph_memory(action="status")` to get the current system state.
2. Present the results in a clear, readable format:
   - Whether memory is initialized
   - Pipeline mode (dedicated vs piggyback)
   - Node count and pending dreams
   - Any warnings (MAP budget, decay risk, etc.)
3. If `firstRun` is true, suggest running `/graph-memory:memory-onboard` to set up memory.
4. If there are warnings, briefly explain what they mean and any recommended actions.
