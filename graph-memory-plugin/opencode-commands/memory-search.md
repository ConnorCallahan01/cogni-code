---
description: Search the knowledge graph for nodes matching a query
---

# /memory-search

Search the knowledge graph for nodes matching the given query.

## Instructions

1. Take the user's search query from `$ARGUMENTS`.
2. Call `graph_memory` with action `search` and `query` set to the arguments.
3. Display results with:
   - Node path and relevance score
   - One-line gist
   - Match reasons (which fields matched)
4. If results are found, offer to read the full content of any node with `graph_memory` action `read_node`.
5. If no results, suggest alternative search terms or offer to list all nodes via `graph_memory` action `status`.
