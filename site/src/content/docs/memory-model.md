---
title: The Memory Model
description: Four layers of memory — a small always-loaded profile over a large on-demand graph.
---

Cogni-Code stores memory in four layers, each serving a different purpose. The layering is the whole point: a small, always-loaded profile sits on top of a large, on-demand knowledge graph.

## Layer 1: Mind (always loaded)

`mind/model.json` is a compact profile of *how you work*. Cognitive style, decision patterns, preferences, guardrails, emotional profile. This is loaded at the start of every session, unconditionally. It is the difference between an agent that knows you and an agent that knows facts about you.

## Layer 2: Project lenses (always loaded)

`lenses/{project}/` holds per-project context. Tech stack, conventions, active work, open threads. When you switch projects, the lens switches too. Your context from one project does not leak into another.

## Layer 3: Session logs (recent history)

`sessions/{project}.jsonl` is an append-only log of what shipped, what was decided, what is blocked, and what the next session should pick up. This is the short-term memory. It rolls forward as you work.

## Layer 4: Knowledge graph (on-demand)

`nodes/` is the durable long-term memory: markdown files organized by category (`decisions/`, `patterns/`, `corrections/`, `procedures/`, etc.), each with YAML frontmatter, edges to other nodes, and a confidence score. This is searchable via `recall` and `search` but not loaded wholesale. It grows over time, decays when unused, and is the substrate the rest of the system reads from.

```
always-loaded  ┌─────────────────────────┐
               │ mind/model.json         │  ~400 tokens
               │ + project lens          │  ~300 tokens
               │ + recent session log    │  ~150 tokens
               └─────────────────────────┘
on-demand      ┌─────────────────────────┐
               │ nodes/ (knowledge graph)│  thousands of nodes
               │ searched via recall     │  only relevant slices loaded
               └─────────────────────────┘
```

The top three layers are small, opinionated, and always injected. The graph is large, searchable, and retrieved only when needed. This is how you keep a rich memory without blowing the context window.
