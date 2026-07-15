---
title: Project Structure
description: Repository layout for the cogni-code codebase.
---

```text
graph-memory-plugin/    # The installable plugin (npm: cogni-code). Start here.
  src/graph-memory/      # Core logic, pipeline, mental model, CLI, adapters
  agents/                # Background worker instructions
  bin/                   # Install scripts and Docker helpers
  commands/              # Slash commands (Claude Code)
  opencode-commands/     # Slash commands (OpenCode)
  hooks/                 # Hook templates (Claude Code, Codex CLI)
  skills/                # Memory skill + /recall
  extensions/            # Plugin entry points (OpenCode, pi)
  templates/             # Memory section templates

memory-dashboard/        # Optional inspection UI (React + Express)
docs/                    # Setup guides and diagrams
examples/                # Command examples, tool actions, SDK usage
```

The plugin is published to npm as **`cogni-code`**. The CLI dispatcher (`src/graph-memory/cli.ts`) provides `install`, `hook <event>`, `mcp`, and `status` subcommands. The MCP tool name remains `graph_memory` (what the LLM calls).

## Read next

- **[Setup guide](https://github.com/ConnorCallahan01/cogni-code/blob/main/docs/setup-from-clone.md)** — detailed clone-to-first-memory walkthrough
- **[Plugin README](https://github.com/ConnorCallahan01/cogni-code/blob/main/graph-memory-plugin/README.md)** — full architecture and configuration
- **[Examples](https://github.com/ConnorCallahan01/cogni-code/tree/main/examples)** — commands, tool actions, skill usage, SDK integration
- **[CHANGELOG](https://github.com/ConnorCallahan01/cogni-code/blob/main/graph-memory-plugin/CHANGELOG.md)** — version history
