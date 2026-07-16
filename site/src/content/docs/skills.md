---
title: Skills
description: Cogni-Code ships with slash-command skills and auto-generates its own from frequently-recalled memory.
---

Cogni-Code ships with skills that become part of how your agent operates. They are not plugins you configure &mdash; they are slash commands and tools your agent uses directly.

## Built-in slash commands

| Command | What it does |
|---------|-------------|
| `/memory-onboard` | First-run setup: storage, runtime, seed memory |
| `/memory-status` | Graph health snapshot. Node counts, confidence, warnings |
| `/memory-search <query>` | Keyword search across all knowledge |
| `/recall <query>` | Deep graph lookup with edge traversal |
| `/memory-morning-kickoff` | Start-of-day briefing built from your memory |
| `/memory-wire-project` | Inject memory context into your project's `CLAUDE.md` or `AGENT.md` |
| `/memory-switch-harness` | Switch background pipeline worker (codex, claude, pi, opencode, api) |
| `/memory-connect-inputs` | Configure external inputs (Gmail, Calendar, Slack) for briefings |
| `/memory-input-refresh` | Refresh configured external input sources |
| `/refresh-skill` | Update a Skillforge-generated skill whose source node has drifted |
| `/skill-install` | Install Skillforge-generated skills into the current project |
| `/notion-setup` | Create Notion workspace structure |
| `/notion-sync` | Run outbound sync (diff → plan → execute) |
| `/notion-consolidate` | Merge batched wiki pages into category pages |

## Auto-generated skills (Skillforge)

Skillforge watches your memory graph for nodes that get accessed frequently. Patterns you keep recalling. Procedures you keep following. Decisions you keep referencing. When a node crosses a scoring threshold, it gets converted into an executable slash command skill.

Your agent literally writes its own tools based on what it keeps looking up. Skills auto-refresh when the source node content changes.

```text
# This happens automatically:
# 1. You recall "ssh provisioning" across 8 sessions
# 2. Skillforge converts it into a /provision-ssh slash command
# 3. Next time, your agent just runs the skill
```

## Included agent skills

The plugin ships with a `graph-memory` skill that teaches your agent when and how to use memory. When to recall before debugging. When to remember a corrected mistake. When to record a decision. Your agent is memory-literate out of the box.
