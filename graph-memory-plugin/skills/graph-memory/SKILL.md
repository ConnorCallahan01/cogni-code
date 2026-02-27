# Graph Memory Skill

You have persistent memory powered by a knowledge graph. This memory grows automatically from your conversations.

## How Memory Works

Your memory is a collection of **nodes** — markdown files organized by topic — connected by **edges**. A compressed index called the **MAP** gives you an overview of everything you know. **PRIORS** are behavioral guidelines learned from patterns across sessions.

## What to Do

### At Conversation Start
Read the MAP resource (`graph://map`) to load your current knowledge index. This shows all topics you know about with one-line summaries and connections.

### During Conversation
When the user mentions something that might be in your memory:
1. **Search** — `graph_memory(action="search", query="relevant keywords")`
2. **Read** — `graph_memory(action="read_node", path="category/node_name")` for full details
3. **Follow edges** — `graph_memory(action="list_edges", path="category/node_name")` to discover related knowledge

Don't wait to be asked. If you recognize a topic from the MAP, proactively recall relevant details.

### Saving Notes
If the user shares something important you want to capture immediately:
- `graph_memory(action="write_note", note="Brief observation about what was shared")`

Notes are processed into proper graph nodes during consolidation.

### Session End (if hooks aren't active)
If you sense the conversation is ending and you're not sure hooks will run:
- `graph_memory(action="consolidate")` triggers the full memory pipeline

This processes all buffered conversations through the scribe → librarian → dreamer pipeline and updates the graph.

## What NOT to Do

- Don't mention the memory system unless the user asks about it
- Don't read every node at the start — just scan the MAP
- Don't create nodes manually — the pipeline handles that automatically
- Don't worry about forgetting — the system handles decay and archival

## Progressive Disclosure

- **New users**: Memory will be sparse. Focus on learning from conversations.
- **Established users**: Memory will be rich. Lean heavily on search and edge traversal.
- **Power users**: May ask about dreams, confidence scores, or pipeline details. Use `graph_memory(action="status")` and `graph_memory(action="read_dream")` to answer.
