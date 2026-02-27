# graph-memory-plugin

Persistent, self-evolving memory for AI agents. Install this plugin to give any Claude Code agent a knowledge graph that grows from conversations.

## What It Does

- **Remembers** across sessions — names, preferences, project context, decisions
- **Learns** behavioral patterns — extracts priors that shape how the agent thinks
- **Dreams** — creative recombination finds surprising connections between topics
- **Decays** — unused knowledge fades naturally, keeping memory fresh and relevant
- **Versions** — full git history of every memory change, with easy rollback

## Install

### Claude Code

```bash
# Clone the plugin
git clone https://github.com/you/graph-memory-plugin ~/.claude/plugins/graph-memory

# Install and build
cd ~/.claude/plugins/graph-memory
npm install
npm run build

# (Optional) Set API key for dedicated pipeline mode
export ANTHROPIC_API_KEY=sk-...

# Start Claude Code — plugin loads automatically
claude

# Run onboarding
> /graph-memory:memory-onboard
```

### Agent SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Hello",
  options: {
    plugins: [{ type: "local", path: "./node_modules/graph-memory-plugin" }],
    allowedTools: ["mcp__graph-memory__*"]
  }
})) { ... }

// At session end:
await graph_memory({ action: "consolidate" });
```

## How It Works

### The Graph
Memory is stored as markdown files with YAML frontmatter — the filesystem IS the database. Each node has a confidence score, edges to related nodes, somatic markers (emotional weighting), and decay rate.

### The Pipeline
1. **Scribe** (Haiku) — Every 5 messages, a background agent extracts structured deltas
2. **Librarian** (Sonnet) — At session end, reconciles all deltas into graph updates
3. **Dreamer** (Sonnet, temp=1.0) — Creative recombination finds non-obvious connections
4. **Git** — Auto-commits all changes with structured messages

### Two Pipeline Modes

**Piggyback mode** (default, no API key):
The pipeline runs through the host agent's own capabilities. No extra cost configuration needed.

**Dedicated mode** (set `ANTHROPIC_API_KEY`):
The MCP server makes direct API calls. Faster, uses less context, costs ~$0.02-0.05/session.

## Commands

| Command | Description |
|---------|-------------|
| `/graph-memory:memory-onboard` | First-time setup — choose storage, seed memory |
| `/graph-memory:memory-status` | Check system health, node count, warnings |
| `/graph-memory:memory-search <query>` | Search the knowledge graph |

## MCP Tools

The `graph_memory` tool supports these actions:

| Action | Description |
|--------|-------------|
| `read_node` | Read a node by path |
| `search` | Keyword search across all nodes |
| `list_edges` | Get connections for a node |
| `read_dream` | Read dream fragments |
| `write_note` | Save a working note |
| `status` | System health check |
| `history` | Recent git commits |
| `revert` | Rollback to a commit |
| `consolidate` | Run full pipeline |
| `log_exchange` | Buffer messages for processing |

## MCP Resources

| Resource | Description |
|----------|-------------|
| `graph://map` | Knowledge graph index (~5000 tokens) |
| `graph://priors` | Behavioral guidelines |

## Configuration

| Config | Required? | Source | Default |
|--------|-----------|--------|---------|
| `ANTHROPIC_API_KEY` | No | Env var | Piggyback mode |
| Graph storage path | Set during onboarding | `~/.graph-memory-config.yml` | `~/.graph-memory/` |
| Model preferences | No | `config.yml` in graph root | Haiku/Sonnet |
| Git auto-commit | No | `config.yml` in graph root | Enabled |
| Git auto-push | No | `config.yml` in graph root | Disabled |

## Architecture

```
Conversation → BufferWatcher → Scribe (every 5 msgs)
                                  ↓
                              Deltas (.deltas/)
                                  ↓
Session End → Librarian → Graph Updates (nodes/, MAP.md, PRIORS.md)
                ↓
              Dreamer → Dream Fragments (dreams/)
                ↓
              Git Commit → Full History
```
