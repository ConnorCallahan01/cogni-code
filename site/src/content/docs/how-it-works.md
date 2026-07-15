---
title: How It Works
description: Cogni-Code runs a continuous loop — capture, process, inject, evolve.
---

Cogni-Code runs a continuous loop with four phases: **capture, process, inject, evolve**.

```
  your conversation
        │
        ▼
  ┌──────────────┐     ┌───────────────┐
  │ session hooks │────▶│ graph_memory  │   ← MCP tool you call directly
  │ capture state │     │ tool surface  │     (remember, recall, search...)
  └──────────────┘     └──────┬────────┘
                              │
                 ┌────────────▼────────────┐
                 │     background pipeline  │
                 │                          │
                 │  scribe → auditor →      │   ← active pipeline (always runs)
                 │  librarian → dreamer     │
                 │                          │
                 │  observer (writes to     │   ← always active, single node store
                 │  nodes/ alongside main)  │
                 └────────────┬────────────┘
                              │
                 ┌────────────▼────────────┐
                 │     ~/.graph-memory/     │
                 │                          │
                 │  mind/model.json         │   ← cognitive profile (always active)
                 │  lenses/{project}/       │   ← project models (always active)
                 │  sessions/{project}.jsonl│   ← session logs (always active)
                 │  nodes/                  │   ← knowledge graph (canonical store)
                 │  dreams/                 │   ← creative associations
                 └─────────────────────────┘
```

## Capture

Session hooks watch your conversations and tool traces. Nothing is sent anywhere. The hooks write to a local buffer.

## Process

The scribe extracts structured deltas from the buffer. The auditor detects stale and contradictory nodes. The librarian applies judgment-heavy updates with a prune-over-preserve philosophy. The dreamer creates speculative cross-node associations. None of this is your agent trying to manage its own memory &mdash; it is a separate pipeline that runs after the fact.

## Inject

The next session starts with layered context: who you are (mental model), how this project works (project lens), what happened recently (session log), and what is most relevant (per-project knowledge index). The total cost is a few thousand tokens. Your agent resumes where the last one left off instead of reconstructing the world from scratch.

## Evolve

Memory decays when unused. Nodes archive gracefully. Dreams surface unexpected connections. Skillforge promotes frequently-recalled memories into slash commands. Everything is git-backed and reversible.
