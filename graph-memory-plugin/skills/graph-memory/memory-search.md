---
name: memory-search
description: Search the knowledge graph for nodes matching a given query. Use when the user wants to search their memory by keyword.
---

# /memory-search

Search the knowledge graph for nodes matching the user's query.

## Instructions

1. Take the user's search query. If no query was provided, ask what to search for.
2. Call `graph_memory(action="search", query="<the query>")` to search the graph.
3. Display results with:
   - Node path and relevance score
   - One-line gist
   - Match reasons (which fields matched)
4. If results are found, offer to read the full content of any node with `graph_memory(action="read_node", path="...")`.
5. If no results, suggest alternative search terms or offer to list all nodes via `graph_memory(action="status")`.
