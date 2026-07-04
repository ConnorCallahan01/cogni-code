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
   - **Runtime mode**: Ask whether they want manual or Docker runtime. Docker is recommended for background pipeline workers.
   - **Worker harness**: Ask which agent harness should run the background pipeline (scribe → auditor → librarian → dreamer). Always ask explicitly — do not silently auto-detect from `PATH`, since the host may have more than one CLI installed and the one on `PATH` isn't necessarily the one the user wants to pay for pipeline usage:
     - `codex` (OpenAI Codex CLI) — requires `codex login` auth. Best for ChatGPT subscribers.
     - `claude` (Anthropic Claude Code) — requires `claude` CLI on PATH, uses existing OAuth or API key. Best for Claude subscribers.
     - `pi` (pi coding agent) — requires `pi` CLI on PATH, uses existing subscription or API key. Open-source, provider-agnostic.
     - `opencode` (OpenCode) — requires `opencode` CLI on PATH, uses provider API keys configured via `opencode providers`. Open-source, provider-agnostic.
     If the user isn't sure, recommend codex for ChatGPT subscribers, claude for Claude subscribers, or pi/opencode as provider-agnostic fallbacks.
   - **Configure**: Call `graph_memory(action="configure_runtime", runtimeMode="manual|docker", workerProvider="<chosen_harness>")`.
   - **Docker worker auth** (Docker mode only): tell the user to authenticate the chosen harness for the container runtime, then run `bin/docker-bootstrap.sh` followed by `bin/docker-auth-check.sh` (harness-aware). For codex specifically, `bin/docker-codex-import-host-auth.sh` copies existing host `codex login` auth into the container; analogous `bin/docker-claude-import-host-auth.sh` exists for claude.
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
