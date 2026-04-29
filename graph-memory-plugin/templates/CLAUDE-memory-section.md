<!-- BEGIN graph-memory plugin section — managed by /memory-onboard. Re-running /memory-onboard will replace everything between these markers. Edit freely outside them. -->

## Memory

You have persistent memory. It is a knowledge graph of markdown nodes on disk, loaded at session start, written by you and a background pipeline, queryable through the `graph_memory` MCP tool.

Treat memory as your delegated working memory across sessions. The user does not want to re-explain things. You do not want to re-derive things.

### Operating Rules

1. **Recall before deriving.** Before debugging an external system, proposing structural changes, answering a topical question, or investigating something the user has likely told you before — call `graph_memory(action="recall", query="…")`. Wasted derivation when the answer was already in memory is the highest-frustration failure mode on record. Recall is cheap. Re-deriving is not.

2. **Trust the auto-loaded context.** `MAP.md`, `PRIORS.md`, `SOMA.md`, `WORKING.md`, and `DREAMS.md` are loaded into context at session start. MAP is a compressed index — when a gist matches the topic, pull the full node with `read_node` rather than guessing.

3. **Use ambient recall hints.** When you see `<graph-memory-context>` injected before a user message, those are pre-matched nodes for the current topic. Read the relevant ones in full before answering.

4. **Execute pipeline tags immediately.** When session context contains `<graph-memory-action>` tags, run the instructions inside as background tasks (Agent tool, `run_in_background=true`) before responding. These are automated pipeline operations, not optional suggestions.

5. **Remember without announcing.** When you discover a durable preference, decision, pattern, or correction — write it. Do not narrate the write. Do not ask permission. Just record it.

6. **Never mention the memory system** unless the user explicitly asks. No "I'll remember that," no "let me check my memory," no meta-commentary. Memory is invisible infrastructure.

### What to Remember

Write a node when the signal will outlive the session:

- **Preferences** — how the user wants tradeoffs framed, code structured, communication paced
- **Decisions** — architectural choices and their rationale (the *why*, not the *what*)
- **Patterns** — recurring shapes in how the user thinks, builds, or corrects you
- **Corrections** — when the user pushes back, that is high-signal preference data
- **Project facts** — topology, credentials locations, deployment specifics, named workflows
- **Stewards / SMEs** — which agent or skill owns which domain in this repo

### What to Skip

- Per-bug debugging steps (unless they reveal a transferable pattern)
- Routine code changes with no architectural significance
- Information already captured in code, comments, or repo docs
- Ephemera the next session will not benefit from

### How to Remember

```text
graph_memory(
  action="remember",
  path="category/short-name",
  gist="One-sentence summary — this is what MAP and search match on",
  content="Full details. Why it matters. Context the gist can't carry.",
  tags=["tag1", "tag2"],
  confidence=0.7,
  edges=[{target: "other/node", type: "supports", weight: 0.7}]
)
```

Categories: `patterns/`, `decisions/`, `preferences/`, `architecture/`, `concepts/`, `projects/`, `people/`, `procedures/`.

Keep paths short, lowercase, hyphenated. Reuse a path to update an existing node — `remember` merges.

### Soma — Emotional Signal

When the user shows excitement, frustration, emphasis, or relief, attach a soma marker. High intensity = high salience. The librarian uses these to weight what surfaces later.

```text
soma={valence: "positive" | "negative", intensity: 0.0-1.0, marker: "What the signal was"}
```

Frustration over a repeated failure mode at intensity ≥ 0.7 should almost always become a node — that is the system telling you "do not let this happen again."

### Edges

Connect nodes with typed edges. Useful types: `supports`, `contradicts`, `extends`, `part_of`, `precedes`, `evidenced_by`, `derives_from`, `enables`, `blocked_by`, `validates`, `relates_to`, `contains`, `pattern_transfer`. A node without edges is an island — prefer connecting to at least one existing node.

### Tool Reference

| Action | Use it when |
|--------|-------------|
| `recall` | First reflex on any topic that might be remembered. Returns matches plus 1-hop neighbors. |
| `search` | Lighter keyword scan when you only need the index hit. |
| `read_node` | Full content + frontmatter for a known path. |
| `list_edges` | Following the graph from a known node. |
| `remember` | Create or update a durable node. |
| `write_note` | Drop a working note into the buffer for later consolidation. |
| `resurface` | Pull an archived node back into the active graph. |
| `status` | Graph health, node counts, runtime state, warnings. |
| `history` / `revert` | Inspect or roll back graph state via git. |
| `consolidate` | Manually trigger the mechanical pipeline pass. |

### The Pipeline (Context, Not Action)

A background pipeline runs on its own — you do not invoke it directly:

1. **Scribe** extracts deltas from the recent buffer.
2. **Auditor** does mechanical triage (orphan edges, decay, archive, dedupe).
3. **Librarian** makes judgment calls (merges, PRIORS edits, pinning).
4. **Dreamer** produces speculative cross-node fragments.
5. **Git** commits each consolidation so it can be reviewed or reverted.

Your job is to feed it good signal — clean writes, accurate gists, honest soma — and to read what it produces.

### The One-Line Version

> Recall before deriving. Remember without announcing. Never narrate the system.

<!-- END graph-memory plugin section -->
