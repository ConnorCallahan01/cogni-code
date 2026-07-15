---
title: Introduction
description: Cogni-Code gives your AI agent a persistent, inspectable memory that outlasts the session.
---

import { Card, CardGrid } from '@astrojs/starlight/components';

Every time you start a new session, your agent starts from zero. It forgets your preferences, your decisions, the bug you spent two hours on yesterday, the deployment strategy you settled on last week. **Cogni-Code fixes that.**

It is a persistent, inspectable memory system for Claude Code, Codex CLI, OpenCode, pi, and any MCP-compatible agent. Your agent learns how you work across sessions and gets sharper every time you use it. Memory lives as plain files on your disk &mdash; you can read it, edit it, diff it, and back it up with git.

## What makes it different

Most agent memory falls into one of three camps:

- **Built-in memory** (ChatGPT memory, Claude's saved context) is opaque, vendor-controlled, and locked to one product.
- **Vector-DB memory** (mem0, Letta, Zep) stores embeddings in a database. Powerful retrieval, but you cannot read what your agent knows without a UI.
- **Hand-written context files** (`CLAUDE.md`, `AGENT.md`, `.cursorrules`) give you full control but require you to write and maintain them by hand.

Cogni-Code is a fourth option: **plain files on disk, maintained automatically, capturing behavior rather than just facts.**

| | Cogni-Code | Built-in | Vector-DB | Hand-written |
|---|---|---|---|---|
| **Where it lives** | Your filesystem | Vendor cloud | Database / SaaS | Your repo |
| **Can you read it?** | Yes (`cat`, grep, diff) | Limited UI | Partial | Yes |
| **Self-hosted** | Yes | No | Sometimes | Yes |
| **Maintained by** | Background pipeline | Vendor | Agent or app | You, manually |
| **Captures** | Behavior + facts | Mostly facts | Mostly facts | Whatever you write |
| **Decays when stale** | Yes | No | Usually no | No |
| **Multi-agent** | Yes | No | Sometimes | Manual |
| **Generates its own tools** | Yes (Skillforge) | No | No | No |
| **Git-backed history** | Yes | No | Rarely | If you commit it |

<CardGrid stagger>
  <Card title="Install" icon="rocket">
    Get up and running with a single command.
  </Card>
  <Card title="How it works" icon="seti:settings">
    The capture &rarr; process &rarr; inject &rarr; evolve loop.
  </Card>
  <Card title="The memory model" icon="brain">
    Layered always-loaded context over an on-demand graph.
  </Card>
  <Card title="Tool reference" icon="seti:api">
    Every `graph_memory` action, documented.
  </Card>
</CardGrid>
