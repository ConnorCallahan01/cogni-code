---
description: Refresh Gmail and Calendar inputs on the host
---

# /memory-input-refresh

Refresh Gmail and Calendar inputs on the host so the latest communication tasks can feed the morning brief.

## Instructions

1. Call `graph_memory` with action `status` first so you know the graph root.
2. Locate the plugin directory and run `bin/external-inputs.sh status`
3. If Gmail or Calendar inputs are enabled, run:
   - `bin/external-inputs.sh refresh`
4. Present the refresh result clearly:
   - which sources ran
   - which sources were skipped because they are disabled
   - where the classified outputs were written
   - for Gmail, explain that the default refresh reads a recent window of messages from roughly yesterday into today, not just unread inbox items
5. If `gws` auth or API setup fails, explain the failure directly and do not pretend the refresh worked.
6. End by telling the user that the next morning brief or morning kickoff can now consume these refreshed inputs.
