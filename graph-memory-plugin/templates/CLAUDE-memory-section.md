## Memory System

This project uses **graph-memory** — a persistent knowledge graph that evolves across sessions via Claude Code hooks and MCP tools.

### How It Works

At session start, five context files are automatically loaded into your context:
- **PRIORS.md** — Cognitive model: how the user thinks, decides, and works
- **SOMA.md** — Emotional engagement calibration (high-intensity signals = high importance)
- **MAP.md** — Compressed index of all knowledge nodes (~50-80 tokens each)
- **WORKING.md** — Volatile working memory from recent sessions
- **DREAMS.md** — Speculative fragments from creative recombination

A background pipeline runs automatically:
1. **Scribe** — Extracts structured deltas from conversation every ~10 messages
2. **Auditor** — Mechanical triage when deltas accumulate (orphaned edges, decay, archiving)
3. **Librarian** — LLM reasoning: merges, refinements, depth restructuring
4. **Dreamer** — Creative recombination of knowledge at high temperature

### System Operations

1. **Execute `<graph-memory-action>` tags immediately.** When session context contains these tags, run the instructions inside them as background tasks (using the Agent tool with `run_in_background=true`) before responding to the user. These are automated pipeline operations.

2. **Use `<graph-memory-context>` for ambient recall.** When you see these tags injected before a user message, they contain auto-matched memory nodes relevant to the current message. Use them as context — read full nodes via `graph_memory(action="read_node")` when the gist alone isn't enough.

3. **Recall before responding.** Before responding to topics that might be in memory, use `graph_memory(action="recall", query="...")` to check for relevant context. The MAP loaded at session start is a compressed index — full node content is available on demand.

4. **Remember significant things.** When you discover important user preferences, project patterns, architectural decisions, or corrections, record them:
   ```
   graph_memory(action="remember", path="category/name", gist="One-sentence summary",
     content="Full details...", tags=["tag1", "tag2"], confidence=0.7,
     edges=[{target: "other/node", type: "supports"}])
   ```
   Categories: `patterns/`, `decisions/`, `architecture/`, `preferences/`, `concepts/`, `projects/`, `people/`

5. **Record emotional signals.** When the user shows excitement, frustration, or emphasis, record with soma markers:
   ```
   graph_memory(action="remember", path="...", ...,
     soma={valence: "positive", intensity: 0.8, marker: "Description of the emotional signal"})
   ```

6. **Never mention the memory system** unless the user explicitly asks about it.

### What to Remember vs Skip

**Remember** (patterns that transfer across sessions):
- User preferences and working style
- Architectural decisions and their rationale
- Recurring patterns in how the user thinks or builds
- Corrections the user makes (these reveal strong preferences)
- Project-level facts that would be lost between sessions

**Skip** (transient or low-value):
- Per-bug debugging steps (unless they reveal a pattern)
- Routine code changes with no architectural significance
- Information already captured in code comments or docs

### Tool Reference

| Action | Use |
|--------|-----|
| `recall` | Search + edge traversal. Start here for any topic lookup. |
| `remember` | Create or update a node. Merges into existing if path matches. |
| `read_node` | Full node content with frontmatter metadata. |
| `search` | Keyword search on the index (lighter than recall). |
| `list_edges` | Show all connections from a node. |
| `resurface` | Recover an archived node back to active graph. |
| `status` | Graph health and pipeline state. |
| `consolidate` | Trigger manual mechanical consolidation. |

### Node Anatomy

Each node is a markdown file with YAML frontmatter:
- **path** — Category/name identifier (e.g. `patterns/agree-or-fail`)
- **gist** — One-sentence summary (this is what MAP.md and search index use)
- **confidence** — 0-1 score, decays over time, reinforced by recall/update
- **tags/keywords** — Used for search matching
- **edges** — Typed connections to other nodes (supports, contradicts, extends, part_of, etc.)
- **project** — Optional scope (e.g. `owner/repo`). Omit for global knowledge.
- **soma** — Optional emotional marker (valence, intensity, description)

### Edge Types

Use descriptive edge types: `supports`, `contradicts`, `extends`, `part_of`, `precedes`, `evidenced_by`, `derives_from`, `enables`, `blocked_by`, `validates`, `relates_to`, `contains`.
