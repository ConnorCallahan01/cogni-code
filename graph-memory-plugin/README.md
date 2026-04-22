# graph-memory plugin

Persistent, graph-backed memory for Claude Code and compatible agent workflows.

This directory is the active plugin surface in the repository. If you cloned the repo, install from here rather than from the legacy root prototype.

## What It Does

- remembers preferences, decisions, project context, and recurring patterns across sessions
- exposes a `graph_memory` MCP tool for search, recall, remember, inspection, and maintenance
- loads compact context artifacts like `MAP.md` and `PRIORS.md` into new sessions
- optionally runs a background `scribe -> auditor -> librarian -> dreamer` pipeline in Docker
- keeps git history for memory changes so you can inspect or revert them

## Install From This Repository

From the repository root:

```bash
cd graph-memory-plugin
./bin/install.sh
```

Then start Claude Code and run:

```text
/memory-onboard
```

Detailed clone-to-first-run instructions are in [../docs/setup-from-clone.md](../docs/setup-from-clone.md).

## Runtime Model

### Manual mode

- MCP tool and graph storage only
- no daemon container
- useful for lightweight local testing

### Docker daemon mode

- recommended for normal use
- Claude Code stays on the host
- graph root stays on the host
- daemon and bounded workers run in Docker against the mounted graph root

Useful helpers:

- `bin/docker-bootstrap.sh`
- `bin/docker-doctor.sh`
- `bin/docker-auth-check.sh`
- `bin/docker-codex-import-host-auth.sh`
- `bin/docker-codex-login.sh`
- `bin/docker-codex-login-api-key.sh`
- `bin/docker-stop.sh`

## Commands

Installed slash commands:

| Command | Description |
|---------|-------------|
| `/memory-onboard` | Initialize storage, choose runtime mode, and seed first memory nodes |
| `/memory-status` | Report graph health, runtime state, counts, and warnings |
| `/memory-search <query>` | Search the graph index |
| `/memory-morning-kickoff` | Turn the latest brief into a focused daily kickoff |

Compatibility aliases are also installed under `/graph-memory:<command>`.

## MCP Tool

The plugin exposes one MCP tool: `graph_memory`.

Supported actions:

| Action | Description |
|--------|-------------|
| `initialize` | Create the graph structure and global pointer file |
| `configure_runtime` | Choose manual or Docker runtime and write runtime config |
| `status` | Report initialization state, runtime, counts, and warnings |
| `remember` | Create or update a durable graph node |
| `write_note` | Save a working note into the buffer |
| `search` | Keyword search over the graph index |
| `recall` | Search plus edge traversal |
| `read_node` | Read a node by path |
| `list_edges` | Inspect node connections |
| `read_dream` | Read dream fragments |
| `consolidate` | Run the consolidation path manually |
| `history` | Show recent git history |
| `revert` | Roll the graph back to an earlier commit |
| `resurface` | Move an archived node back into the active graph |

Resources:

| Resource | Description |
|----------|-------------|
| `graph://map` | compressed knowledge map |
| `graph://priors` | learned behavioral priors |

## Configuration

| Config | Source | Default |
|--------|--------|---------|
| graph root pointer | `~/.graph-memory-config.yml` | `~/.graph-memory/` |
| per-graph settings | `<graphRoot>/config.yml` | git enabled |
| runtime config | `<graphRoot>/.runtime-config.json` | `manual` |

## Development Notes

- build: `npm run build`
- type-check: `npx tsc --noEmit`
- plugin manifest: [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json)
- examples: [`../examples/`](../examples/)
