---
description: First-time graph memory setup — storage, runtime, initial memory seed
---

# /memory-onboard

First-time setup for graph memory. Guides the user through choosing a storage location, configuring the background runtime, and seeding initial memory.

## Instructions

1. Check if memory is already initialized via `graph_memory` with action `status`
2. If already initialized, show current status and ask if they want to re-initialize
3. If not initialized, guide through:
   - Choosing a storage location
   - Selecting runtime mode
   - Creating or connecting the bind-mounted memory storage
   - Running healthchecks to verify queue and storage connectivity
   - Running a short interview to seed initial memory nodes and priors
   - Wiring memory awareness into the project's `AGENTS.md` from the plugin template (idempotent — safe to re-run)
   - Starting the background daemon if Docker mode is enabled

Open the onboarding with this exact ASCII banner once, in a fenced `text` block:

```text
      o----o----o
     / \  / \    \
    o---oo---o----o
     \  / \  |   /
      o----o-o--o
            \  /
             o

      C O G N I - C O D E
      graph-memory onboarding
```

Follow this sequence: inspect current status, initialize the graph root, configure runtime, seed initial memory, and end with concrete next steps.
