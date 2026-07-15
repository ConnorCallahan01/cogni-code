---
title: Dashboard
description: An optional local inspection UI to see exactly what your agent knows.
---

Optional local inspection UI. See exactly what your agent knows.

```bash
cd memory-dashboard
npm install && npm run dev
```

- **Architecture view.** Inspect your mental model, project lenses, whisper preview, and inject flow.
- **Graph explorer.** Interactive node graph with inline editing.
- **Session replay.** Per-session event timeline with tool traces and delta previews.
- **Pipeline status.** Real-time view of the scribe → auditor → librarian → dreamer chain.
- **Dream actions.** Accept or reject speculative associations.
- **Memory health.** Node count, average confidence, category coverage, staleness score.

Server runs on port 3001. Frontend on port 5173.
