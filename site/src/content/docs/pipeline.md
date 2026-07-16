---
title: The Pipeline
description: The background pipeline distills conversations into memory so your agent doesn't manage it mid-conversation.
---

The pipeline runs in the background so your agent does not have to manage its own memory mid-conversation. Most of it happens automatically. You talk. It learns.

## Stages

| Stage | What it does |
|-------|-------------|
| **Scribe** | Extracts structured deltas from conversation buffers. Captures evolving opinions, frustrations, and contradictions, not just hard facts. |
| **Auditor** | Mechanical triage. Detects stale nodes, contradictions, and noise candidates. |
| **Librarian** | Applies judgment-heavy graph updates with a prune-over-preserve philosophy. Regenerates context files. |
| **Dreamer** | Creates speculative cross-node associations via creative recombination. |
| **Observer** | Produces structured observations from conversation patterns. Writes to the shared `nodes/` store. |
| **Skillforge** | Promotes frequently-accessed nodes into executable slash command skills. |
| **Bootstrap** | Auto-generates project docs (`CLAUDE.md`, `AGENT.md`) from mental model data. |
| **Working update** | Extracts key files from tool traces to prime the next session with what you actually edited. |

## Runtime modes

The pipeline runs either in **manual mode** (just the tool, no daemon) for lightweight local testing, **Docker daemon mode** (recommended for desktops) where the host agent stays on your machine and bounded workers run in a container, or **API mode** where workers call the Anthropic API directly — ideal for containers and sandboxes without Docker.

| Mode | Daemon | Worker execution | Best for |
|------|--------|-------------------|----------|
| Manual | No | None (on-demand only) | Local testing |
| Docker | Docker container | CLI subprocess (codex/claude/pi/opencode) | Desktops with Docker |
| API | Node process (no Docker) | Direct `fetch` to Anthropic API | Containers, sandboxes, CI |

In API mode, the worker routes through your existing credential proxy (e.g. OneCLI Agent Vault in NanoClaw), so it uses your **subscription** rather than accruing API costs. See [Install](/install/) for setup.

Configure the runtime with the `configure_runtime` action or `--docker --worker api` at install time.

## Reliability

If a worker times out (for example, a provider usage limit), the daemon retries on the configured fallback worker (`fallbackProvider`/`fallbackModel`). Daemon ticks are wrapped in try/catch, per-file I/O is guarded, and unknown job types throw explicit errors rather than failing silently.
