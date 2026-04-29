# /memory-onboard

First-time setup for graph memory. Guides the user through choosing a storage location, configuring the background runtime, connecting worker auth for the container, and seeding initial memory.

## Instructions

Launch the `memory-onboarder` agent to handle the guided onboarding flow. This agent will:

1. Check if memory is already initialized via `graph_memory(action="status")`
2. If already initialized, show current status and ask if they want to re-initialize
3. If not initialized, guide through:
   - Choosing a storage location
   - Selecting runtime mode, with Docker daemon mode as the recommended default
   - Creating or connecting the bind-mounted memory storage
   - Configuring worker auth for the container runtime, preferably by importing existing host Codex auth
   - Running healthchecks to verify queue, storage, and worker connectivity
   - Running a short interview to seed initial memory nodes and priors
   - Wiring memory awareness into the project's `CLAUDE.md` from the plugin template (idempotent — safe to re-run)
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

Use the `memory-onboarder` agent prompt to run the onboarding flow directly. Follow its sequence: inspect current status, initialize the graph root, configure runtime, explain Docker worker auth/bootstrap, seed initial memory, and end with concrete next steps.
