---
title: Tool Reference
description: Every graph_memory MCP tool action, documented.
---

The `graph_memory` MCP tool is the primary interface. Your agent uses it directly.

| Action | Description |
|--------|-------------|
| `remember` | Create or update a durable memory node |
| `recall` | Search plus multi-hop edge traversal |
| `search` | Keyword search over the graph index |
| `read_node` | Read a specific node by path |
| `list_edges` | See connections from a node |
| `write_note` | Save a working note into the session buffer |
| `read_dream` | Read pending dream fragments |
| `status` | Graph health, runtime state, node counts |
| `history` | Git-backed change log |
| `revert` | Roll back to an earlier state |
| `resurface` | Restore an archived node to active memory |
| `initialize` | Create graph structure and pointer file |
| `configure_runtime` | Choose manual or Docker runtime, set worker provider (codex, claude, pi, opencode, api) |
| `consolidate` | Run consolidation manually |
| `notion_setup` | Create Notion workspace structure |
| `notion_sync` | Run outbound sync (diff + plan + execute) |
| `notion_consolidate` | Merge batched wiki pages into category pages |

## Common actions

### Recall

```text
graph_memory(action="recall", query="oliver provisioning", depth=1)
```

### Remember

```text
graph_memory(
  action="remember",
  path="patterns/new-pattern",
  gist="One-sentence summary",
  content="Full details...",
  tags=["tag1"],
  confidence=0.7,
  edges=[{ target: "other/node", type: "supports" }]
)
```

### Read a node

```text
graph_memory(action="read_node", path="patterns/some-pattern")
```

### List connections

```text
graph_memory(action="list_edges", path="patterns/some-pattern")
```
