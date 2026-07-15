---
title: Quick Start
description: The full memory loop in five steps — write, retrieve, inspect.
---

That is the whole loop. Write memory, retrieve memory, inspect memory. The background pipeline handles the rest.

```text
# 1. Initialize
/memory-onboard

# 2. Teach it something
graph_memory(
  action="remember",
  path="preferences/deployment",
  gist="Always use blue-green deploys for production services",
  content="Blue-green for prod. Canary for staging. Never direct push.",
  tags=["preferences", "deployment"],
  confidence=0.9
)

# 3. Recall it next session, or next week
/recall deployment strategy

# 4. Check what your agent knows
/memory-status

# 5. See the full history
graph_memory(action="history")
```

## Remembering

Teach your agent a durable fact, decision, or pattern with the `remember` action:

```text
graph_memory(
  action="remember",
  path="decisions/auth-strategy",
  gist="Use Clerk for auth across web and mobile",
  content="Clerk chosen over Auth0 for its SDK quality and org support...",
  tags=["decisions", "auth"],
  confidence=0.9,
  edges=[{ target: "patterns/auth", type: "supports" }]
)
```

## Recalling

Retrieve relevant memory with edge traversal:

```text
graph_memory(action="recall", query="deployment strategy", depth=1)
```

You can also run `/recall <query>` as a slash command in Claude Code.

## Next steps

- Learn [how the pipeline](/pipeline/) maintains memory in the background.
- Browse the full [tool reference](/tool-reference/).
- See [where memory lives](/storage/) on your filesystem.
