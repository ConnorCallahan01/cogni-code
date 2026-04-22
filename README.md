# graph-memory

`graph-memory` is a persistent memory system for AI agents. The active product in this repository is the Claude Code plugin in [`graph-memory-plugin/`](./graph-memory-plugin/) plus the optional inspection UI in [`memory-dashboard/`](./memory-dashboard/).

## Start Here

If you cloned this repository to use the plugin, ignore the legacy prototype code at the repo root and start here instead:

```bash
git clone https://github.com/<your-org>/graph-memory.git
cd graph-memory/graph-memory-plugin
./bin/install.sh
```

Then start Claude Code and run:

```text
/memory-onboard
```

Detailed setup instructions live in [docs/setup-from-clone.md](./docs/setup-from-clone.md).

## Repository Layout

Active surfaces:

- [`graph-memory-plugin/`](./graph-memory-plugin/): installable Claude Code plugin, MCP server, hooks, agents, commands, runtime helpers
- [`memory-dashboard/`](./memory-dashboard/): optional dashboard for inspecting graph state, jobs, logs, briefs, and context files
- [`docs/`](./docs/): public setup and repository documentation
- [`examples/`](./examples/): concrete command, skill, MCP, and SDK usage examples

Reference and legacy material still kept in-repo for context:

- root [`src/`](./src/), [`tests/`](./tests/), [`public/`](./public/), and [`package.json`](./package.json): earlier prototype server path, not required for plugin install
- [`memory_implementation`](./memory_implementation): original interactive spec artifact
- [`graph-memory/`](./graph-memory/) and [`test-app/`](./test-app/): incomplete prototype/reference directories
- `GRAPH_MEMORY_*.md`, `NOTES.md`, `PHASE_*.md`, and `BLOG.md`: design notes, architecture drafts, and writing artifacts

The full repo map is in [docs/repository-layout.md](./docs/repository-layout.md).

## What The Plugin Provides

- Persistent graph-backed memory stored as markdown files with YAML frontmatter
- Claude Code hooks that capture session activity and refresh context
- MCP tool `graph_memory` for search, recall, remember, inspection, and maintenance
- Optional Docker daemon mode for background `scribe -> auditor -> librarian -> dreamer` processing
- Git-backed history and rollback for memory changes

## Examples

Start with:

- [examples/claude-code-commands.md](./examples/claude-code-commands.md)
- [examples/mcp-tool-actions.md](./examples/mcp-tool-actions.md)
- [examples/skill-usage.md](./examples/skill-usage.md)
- [examples/agent-sdk.ts](./examples/agent-sdk.ts)
