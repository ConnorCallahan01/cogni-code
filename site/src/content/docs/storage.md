---
title: Where Memory Lives
description: Everything is plain text on your filesystem — no database, no hidden vector store.
---

Everything is plain text on your filesystem. No database, no hidden vector store.

```text
~/.graph-memory/
  mind/
    model.json              # Cognitive profile, preferences, guardrails
    whisper.txt             # Compressed injection paragraph (~300 tokens)
    observations.jsonl      # Raw observation feed
  lenses/
    {project}/
      model.json            # Project model (tech stack, conventions, active work)
      whisper.txt           # Project-specific compressed context
      observations.jsonl    # Project observations
  sessions/
    {project}.jsonl         # Session logs (shipped, decided, blocked, next)
  nodes/                    # Durable knowledge graph nodes (markdown + YAML)
  archive/                  # Decayed nodes. resurface to restore
    v3-graph-backup/        # Archived diverged graph directory
  dreams/                   # Speculative associations awaiting validation
  working/                  # Per-project volatile context + key files
  briefs/
    daily/                  # Daily brief outputs
  .inputs/                  # External brief inputs (gmail, calendar, slack)
  .notion-sync-state.json   # Notion workspace sync state
  MAP.md                    # Compressed knowledge index
  WORKING.md                # Active session context
```

Your memory is just files. Open them, grep them, edit them, back them up. Git tracks every change.
