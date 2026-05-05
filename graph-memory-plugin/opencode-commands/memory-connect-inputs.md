---
description: Configure Gmail and Calendar inputs for the morning brief
---

# /memory-connect-inputs

Configure optional Gmail and Calendar inputs for the morning brief.

## Instructions

1. Call `graph_memory` with action `status` first so you know the graph root and runtime are healthy.
2. Run `bash` commands to inspect the host environment:
   - `command -v gws`
3. If `gws` is missing, explain that Google Workspace CLI must be installed and authenticated on the host before inputs can be connected.
4. If `gws` exists but is not authenticated, guide the user to authenticate it with the minimal scopes needed for the sources they want:
   - Gmail + Calendar: `gws auth login --scopes gmail,calendar`
5. Initialize or update graph-memory external-input config with the host helper:
   - Locate the plugin directory and run `bin/external-inputs.sh init`
   - `bin/external-inputs.sh enable-gmail`
   - `bin/external-inputs.sh enable-calendar`
6. Explain the default Gmail brief behavior clearly:
   - Gmail is configured for a recent-message window, not just unread-only triage
   - the default lookback is about the last 36 hours so the morning brief can capture "yesterday into this morning"
   - only a small recent set is read, summarized, and stored under `.inputs/`
7. Explain clearly that this first version is `brief_only` mode:
   - Gmail/Calendar inputs influence the morning brief
   - they do not auto-promote into durable graph memory by default
8. End with the exact next command the user should run:
   - `/memory-input-refresh`

Be explicit about what succeeded, what still needs host auth, and where the config lives:
- `<graphRoot>/.inputs/config.json`
