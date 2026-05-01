---
name: graph-memory
description: Persistent knowledge graph memory for AI agents. Use for remembering user preferences, project patterns, decisions, and corrections across sessions. Provides recall, search, remember, read_node, list_edges, and other memory operations via graph_memory tool.
---

# Graph Memory Skill

You have persistent memory powered by a knowledge graph. This memory grows automatically from your conversations via a background scribe agent, and can be written to directly.

## How Memory Works

Your memory is a collection of **nodes** — markdown files organized by topic — connected by **edges**. A compressed index called the **MAP** gives you an overview of everything you know. **PRIORS** are behavioral guidelines learned from patterns across sessions.

## Core Actions

### Remember — Write memory directly
When you discover important user preferences, project patterns, decisions, or corrections:
```
graph_memory(action="remember", path="category/node_name", gist="One-sentence summary",
  content="Details...", tags=["tag1"], confidence=0.7,
  edges=[{target: "related/node", type: "relates_to", weight: 0.7}],
  soma={valence: "positive", intensity: 0.6, marker: "User gets excited"})
```
Do this naturally without announcing it. The scribe catches implicit signals; `remember` handles explicit ones.

### Recall — Search with edge traversal
```
graph_memory(action="recall", query="relevant keywords", depth=1)
```
Returns matching nodes + connected nodes (1 hop). More comprehensive than basic search.

### Search — Basic keyword search
```
graph_memory(action="search", query="keywords")
```

### Read Node — Full details
```
graph_memory(action="read_node", path="category/node_name")
```

### List Edges — Follow connections
```
graph_memory(action="list_edges", path="category/node_name")
```

## Graph Structure

Nodes have YAML frontmatter with:
- **confidence** (0-1): How certain this knowledge is
- **edges**: Connections to other nodes (21+ types: relates_to, contradicts, supports, derives_from, pattern_transfer, etc.)
- **anti_edges**: Rejected connections
- **soma**: Emotional markers {valence, intensity, marker}
- **dream_refs**: Creative connections from the dreamer pipeline
- **tags/keywords**: For search indexing

## When to Use

- **Recall proactively**: When the user mentions something that might be in memory, use `recall` before responding.
- **Remember naturally**: When you learn something worth remembering, use `remember` without announcing it.
- **Follow edges**: When a search finds a node, use `list_edges` to discover related knowledge.
- **Soma markers**: Record emotional signals — user excitement, frustration, or emphasis indicates importance.
- **Never mention the system**: Don't tell the user about memory operations unless they explicitly ask.

## Project Wiring

When working in a project that doesn't yet have graph-memory awareness in its instruction file, run `/memory-wire-project` to install (or refresh) the memory section into the project's `CLAUDE.md`. This is idempotent — safe to re-run on projects that already have the section. It teaches the AI how to use `graph_memory` for recall, remember, and search, and when to proactively check memory before responding.

## Subagent Dispatch

When session context mentions these signals, dispatch the appropriate agent in background:
- "scribe pending" → dispatch memory-scribe agent
- "consolidation pending" → dispatch memory-librarian agent, then memory-dreamer

## Status & Management

- `graph_memory(action="status")` — Check system health
- `graph_memory(action="history")` — View git commit history
- `graph_memory(action="revert", path="<commit_hash>")` — Roll back
- `graph_memory(action="consolidate")` — Process pending deltas mechanically
- `graph_memory(action="read_dream")` — Browse dream fragments
