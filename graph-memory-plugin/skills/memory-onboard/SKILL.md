---
name: memory-onboard
description: First-time setup for graph memory — initialize storage, configure runtime, seed initial memory, and wire project context. Use when the user is setting up memory for the first time or wants to re-initialize.
---

# /memory-onboard

First-time setup for graph memory. Guides the user through choosing a storage location, configuring the background runtime, and seeding initial memory.

## Instructions

1. Check if memory is already initialized via `graph_memory(action="status")`.
2. If already initialized, show current status and ask if they want to re-initialize.
3. If not initialized, guide through:
   - **Storage location**: Default is `~/.graph-memory/`. Ask if they want a custom location.
   - **Initialize**: Call `graph_memory(action="initialize", graphRoot="<path>")`.
   - **Runtime mode**: Ask whether they want manual or Docker runtime. Docker is recommended for background pipeline workers. Call `graph_memory(action="configure_runtime", runtimeMode="manual|docker", ...)`.
   - **Seed initial memory**: Run a short interview to capture key facts, preferences, and project context. Use `graph_memory(action="remember", ...)` to persist each node.
   - **Wire project**: Add graph-memory awareness to the current project's instruction file (see memory-wire-project skill).
4. End with concrete next steps: how to check status, and when the background pipeline runs.

Open with this exact ASCII banner once, in a fenced `text` block:

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
