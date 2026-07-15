---
title: Notion Sync
description: Two-way sync between graph memory and a Notion workspace.
---

Two-way sync between your graph memory and a Notion workspace. Browse, edit, and organize your agent's memory in a human-readable interface. Edits flow back.

- **Outbound.** Graph state mirrors to Notion. Knowledge nodes become wiki pages. Decisions and briefs become database rows.
- **Inbound.** Human edits in Notion are detected and turned into observations and deltas. Never direct node mutations.
- **Three-way merge.** When both sides change, human intent wins. Agent information is preserved as callouts.
- **Five steward agents** manage scoped sync areas: knowledge, projects, tasks, enrichment, and workspace structure.
- **Chunked sync.** 100 items per batch, sorted by confidence. The daemon auto-enqueues the next batch.

## Commands

```text
/notion-setup       # create the Notion workspace structure
/notion-sync        # run outbound sync: diff → plan → execute
/notion-consolidate # merge batched wiki pages into category pages
```

Disk is the agent-readable source of truth. Notion is the human-readable presentation layer. Sync is triggered daily by the daemon (configurable hour), or manually via slash command.

## API details

- Uses Notion API v2026-03-11 with data sources for property management.
- Webhook secret is resolved from the `${NOTION_WEBHOOK_SECRET}` environment variable at runtime.
- Design spec lives at `graph-memory-plugin/docs/notion-sync-spec.md`.
