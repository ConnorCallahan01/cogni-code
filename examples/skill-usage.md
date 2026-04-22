# Skill Usage Examples

The plugin currently exposes one main skill directory at [`graph-memory-plugin/skills/graph-memory/`](../graph-memory-plugin/skills/graph-memory/) plus the user-invocable `/recall` skill file in the same folder.

## `graph-memory` Skill

The skill teaches an agent to use memory proactively instead of waiting for explicit memory commands.

Typical patterns:

### Proactive recall

User says:

```text
We changed our deployment naming scheme last week. What did we settle on?
```

Expected agent behavior:

```text
graph_memory(action="recall", query="deployment naming scheme", depth=1)
```

### Direct remember

User says:

```text
When you review code for me, keep the tone direct and skip the fluff.
```

Expected agent behavior:

```text
graph_memory(
  action="remember",
  path="preferences/communication_style",
  gist="Prefers direct, low-fluff review language.",
  content="Use concise, direct language and avoid motivational filler in reviews.",
  tags=["preferences", "communication"],
  confidence=0.85,
  pinned=true
)
```

### Follow edges after recall

If recall returns a promising node:

```text
graph_memory(action="list_edges", path="preferences/communication_style")
```

This lets the agent inspect adjacent context before responding.

## `/recall`

The recall skill is a user-facing shortcut for deep graph lookup.

Example:

```text
/recall onboarding decisions
```

Expected flow:

1. call `graph_memory(action="recall", query="onboarding decisions", depth=2)`
2. optionally call `graph_memory(action="read_node", path="...")` for the strongest hits
3. summarize direct matches first, then linked context
