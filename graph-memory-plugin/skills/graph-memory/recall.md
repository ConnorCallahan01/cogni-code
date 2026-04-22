---
name: recall
description: Deep search memory graph with edge traversal and full node reading
user_invocable: true
---

# /recall — Deep Memory Search

Search the knowledge graph for relevant context on a topic, with multi-hop edge traversal and optional full node reading.

## Instructions

1. Take the user's query (everything after `/recall`). If no query was provided, ask what topic to search for.

2. Call `graph_memory(action="recall", query="<the query>", depth=2)` to search with 2-hop edge traversal.

3. Review the results. If any direct matches look highly relevant, call `graph_memory(action="read_node", path="<node path>")` on the top 1-2 results to get full content.

4. Synthesize and present the findings concisely — direct matches first, then connected nodes that add context. Include node paths so the user can reference them.

5. If no results are found, suggest alternative search terms based on what you know about the graph structure from MAP.md.
