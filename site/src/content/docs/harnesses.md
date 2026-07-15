---
title: Harnesses & Providers
description: Cogni-Code is provider-agnostic on both ends — your coding agent in front, and the memory worker behind it. Both are swappable.
---

Cogni-Code is two independent layers, and each one is swappable. You are never locked into a single vendor.

| | The coding agent | The memory worker |
|---|---|---|
| **What it is** | The CLI you chat with | The LLM that runs the background daemon |
| **Where it runs** | In front, your session | Behind, the pipeline (scribe/auditor/librarian/dreamer) |
| **Options** | Claude Code, Codex CLI, OpenCode, pi | `codex`, `claude`, `opencode`, `pi` |
| **You change it with** | Install flags | `--worker` / `/memory-switch-harness` |

Your memory lives in one shared graph on disk. Switching either layer does not touch the graph — it just changes which agent reads it or which LLM maintains it.

## The coding agent (front)

This is the agent you actually talk to. Cogni-Code injects context into its session and exposes the `graph_memory` tool to it. Install into whichever harness you run:

```bash
cogni-code install --claude      # Claude Code only
cogni-code install --codex       # Codex CLI only
cogni-code install --opencode    # OpenCode only
cogni-code install --all         # every detected harness
```

With no flags, the installer **auto-detects** every installed harness and wires them all. Install into several at once and they share the same `~/.graph-memory/` graph — start a session in any of them and you pick up the same memory.

## The memory worker (back)

This is the LLM the daemon uses to run the background pipeline (scribe, auditor, librarian, dreamer, observer). It is a separate concern from your coding agent — you can chat in Claude Code while the daemon works via Codex, or any other combination.

The valid worker providers are `codex`, `claude`, `opencode`, and `pi`.

### At install time

```bash
cogni-code install --docker --worker codex
# or: --worker claude / opencode / pi
```

### Anytime, from a session

Switch the worker without reinstalling:

```text
/memory-switch-harness
```

### Via the tool

```text
graph_memory(
  action="configure_runtime",
  runtimeMode="docker",
  workerProvider="codex",
  workerModel="gpt-5.2"
)
```

### Resilience: a fallback worker

If the primary worker hits a limit or times out, the daemon retries on the fallback. Configure both:

```text
graph_memory(
  action="configure_runtime",
  runtimeMode="docker",
  workerProvider="claude",
  workerModel="sonnet",
  fallbackProvider="codex",
  fallbackModel="o3"
)
```

## Manual mode (no daemon)

`runtimeMode: "manual"` runs the tool surface only — no background pipeline, no worker needed. Useful for lightweight local testing. Switch back to `"docker"` to re-enable the full pipeline.

```text
graph_memory(action="configure_runtime", runtimeMode="manual")
```

## Summary

- **Front layer** (coding agent): swappable per session, install with `--claude` / `--codex` / `--opencode` / `--all`.
- **Back layer** (memory worker): the daemon's LLM, set with `--worker`, `/memory-switch-harness`, or `configure_runtime`.
- **The graph is shared and untouched** by either change.
