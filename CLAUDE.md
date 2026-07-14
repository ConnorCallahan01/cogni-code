# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What This Is

This repository contains **graph-memory** — a persistent, self-evolving knowledge graph memory system for AI agents.

Active surfaces:

- **`graph-memory-plugin/`** — The current plugin. MCP server, hooks, runtime helpers, slash commands, skills, agents, and OpenCode extension.
- **`memory-dashboard/`** — Optional inspection UI for graph state, logs, jobs, and briefs.

Legacy/reference material:

- root **`src/`**, **`tests/`**, **`public/`**, and root **`package.json`** — earlier prototype path, not the current install surface

## Repository Structure

```text
graph-memory-plugin/
  src/graph-memory/       # Core graph logic, runtime, inputs, pipeline
    pipeline/             # daemon, queue, graph ops, librarian, dreamer, observer, compressor, notion-sync
    mind/                 # v3 Layer 1: global mental model (model.json, whisper.txt, observations)
    lenses/               # v3 Layer 2: project models and whispers
    sessions/             # v3 Layer 3: session logs
    adapters/             # Harness adapters (claude-code, opencode, pi, codex)
    scripts/              # Migration and utility scripts
  src/hooks/              # Claude Code hooks
  agents/                 # Background agent instruction files (pipeline prompts, notion sync/merge/inbound)
  commands/               # Slash command specs (Claude Code)
  opencode-commands/      # Slash command specs (OpenCode)
  extensions/             # Plugin extension entry points
                           #   graph-memory.ts (pi), graph-memory-opencode.ts (OpenCode)
  skills/                 # Memory skill + /recall
  templates/              # Memory section templates (Claude, OpenCode, Codex, generic)
  docs/                   # Design specs (notion-sync-spec.md)
  bin/                    # Install, runtime, Docker, and hook shell wrappers

memory-dashboard/
  server.ts               # Express API server (port 3001) with SSE event stream
  src/                    # React frontend (Vite, port 5173)
    components/           # Graph explorer, architecture view, session replay
    lib/api.ts            # Typed API client
    styles.css            # OKLCH design system

~/.graph-memory/                    # The actual graph data (outside this repo)
  nodes/                            # Active knowledge nodes (canonical store, 22 category dirs)
  mind/                             # Global mental model
    model.json                      # cognitive style, preferences, guardrails
    whisper.txt                     # pre-generated injection paragraph
    observations.jsonl              # append-only observation feed
  lenses/                           # Per-project models
    {project}/                      # model.json, whisper.txt
    _archived/                      # decommissioned project lenses
  sessions/                         # Session logs
    {project}.jsonl
  archive/                          # Archived nodes + legacy docs
    v3-graph-backup/                # Archived diverged v3 graph directory
  dreams/                           # pending/, integrated/, archived/, projects/
  briefs/                           # Daily brief outputs
    daily/
  working/                          # Per-project working state
    global.md
    projects/                       # {project}.md + {project}.state.json per active project
      _updates/                     # incremental working state updates
  graph/                            # Legacy graph directory (superseded by nodes/)
  .sessions/                        # Per-session capture buffers (UUID + opencode_session dirs)
  .session-context/                 # Session context snapshots (JSON)
  .active-projects/                 # Active project session mappings
  .buffer/                          # Raw hook capture buffer
  .deltas/                          # Scribe output
  .jobs/                            # Background queue state
  .pipeline-logs/                   # Worker logs
  .pipeline/                        # Pipeline intermediate state
    observations/absorbed/          # Absorbed observation deltas
  .logs/                            # Activity log + input-refresh logs
  .inputs/                          # External brief inputs
    gmail/, calendar/, slack/       # Per-source classified/normalized/
    config.json
  .skillforge/                      # Generated skill manifests
  .notion-sync-state.json           # Notion workspace sync state
  .notion-sync-input.json           # Notion sync input staging
  .notion-sync-plan.json            # Notion sync execution plan
  .notion-webhook-token             # Notion webhook token
  config.yml                        # Graph memory runtime config
  manifest.yml                      # Service manifest
  MAP.md, WORKING.md, DREAMS.md    # Context files
  PRIORS.md, SOMA.md               # Legacy context files (superseded by mental model)
```

## Build & Verify

```bash
cd graph-memory-plugin && npm run build
cd graph-memory-plugin && npx tsc --noEmit
cd memory-dashboard && npx tsc --noEmit
```

The plugin is published to npm as **`cogni-code`**. The CLI dispatcher (`src/graph-memory/cli.ts`) provides `install`, `hook <event>`, `mcp`, and `status` subcommands. The MCP tool name remains `graph_memory` (what the LLM calls).

## Pipeline Architecture

The memory system runs automatically via hooks (Claude Code, Codex CLI) or plugin events (OpenCode, pi):

### Active Pipeline (scribe → auditor → librarian → dreamer)

The v2 pipeline is the active, proven pipeline. All four prompts were improved to capture "true memory" — evolving opinions, frustrations, contradictions — not just hard facts.

1. **Session hooks** capture startup context, user prompts, assistant responses, and tool traces.
2. **Scribe** extracts deltas from buffered session state.
3. **Auditor** does mechanical triage: stale/contradictory node detection, noise/bloat candidates, structured recommendations.
4. **Librarian** applies judgment-heavy graph updates with a prune-over-preserve philosophy. Regenerates context files.
5. **Dreamer** creates speculative cross-node fragments.
6. **Git** records graph history for rollback.

### Session Start

Session-start reads `mind/model.json` directly (unconditional) → guardrails (anti-patterns) → project model → session logs → pickup hints → Notion tasks. The structured mental model replaced the old PRIORS.md + SOMA.md approach.

### Architecture

The system is a single unified architecture:

- **Knowledge graph** (`nodes/`), MAP, WORKING, DREAMS, pinned nodes, decay, context regeneration
- **Mental models** (`mind/`), observations, session logs, project lenses
- **Single canonical node store**: `nodes/` — the older `graph/` directory has been archived to `archive/v3-graph-backup/`
- Observer writes to `nodes/`

### Mental Model Data

- **Global model** (`mind/model.json`) — cognitive style, decision patterns, preferences, guardrails, emotional profile
- **Project models** (`lenses/{project}/`) — per-project tech stack, conventions, active work, open threads
- **Session logs** (`sessions/{project}.jsonl`) — shipped work, decisions, blocked items, next-session hints
- **Observations** (`mind/observations.jsonl`, `lenses/{project}/observations.jsonl`) — append-only feeds

### Pipeline Stages: Observer & Compressor (active)

Observer and compressor run by default — they are enqueued automatically (observer on scribe/buffer thresholds, compressor after observer runs) and are **not** gated behind any flag. Observer is a single LLM pass producing observations, session logs, and node upserts; compressor folds observations into mental models. Their reliability depends on the configured worker harness: if a worker times out (e.g. a provider usage limit), the daemon retries on the configured fallback worker (`fallbackProvider`/`fallbackModel`). The separate **dreamer-v3 / dreamer-models** variant is NOT wired — the active dreamer is the v2 project-chain dreamer.

### Additional Pipeline Stages

- **Skillforge** — converts high-access nodes into executable slash-command skills
- **Bootstrap** — auto-generates project docs (CLAUDE.md / AGENT.md) from mental models
- **Working Update** — extracts key files from tool traces and updates per-project working state
- **Memory Analysis** — daily brief generation

### Notion Sync Pipeline

Two-way sync between graph-memory and a Notion workspace for human-readable access:

- **Outbound** — mirrors graph state to Notion: knowledge nodes become wiki pages, decisions/briefs become database rows, projects get their own pages
- **Inbound** — detects human edits in Notion and creates observations/deltas (not direct node mutations)
- **Three-way merge** — when both sides change, human intent wins with agent info preserved as callouts
- **Consolidation** — merges batched wiki pages into category pages, archives the rest
- **Chunked sync** — 100 items per batch, sorted by confidence, daemon auto-enqueues next batch
- Triggered daily by the daemon (configurable hour), or manually via `/notion-sync` command
- Uses Notion API v2026-03-11 with data sources for property management
- Design spec: `graph-memory-plugin/docs/notion-sync-spec.md`

## Using The Memory System

The `graph_memory` tool is available in Claude Code, Codex CLI, OpenCode, and pi sessions after installation. Common actions:

### Recall

```text
graph_memory(action="recall", query="oliver provisioning", depth=1)
```

### Remember

```text
graph_memory(action="remember", path="patterns/new-pattern", gist="One-sentence summary", content="Full details...", tags=["tag1"], confidence=0.7, edges=[{target: "other/node", type: "supports"}])
```

### Other Actions

- `read_node`
- `search`
- `list_edges`
- `status`
- `history` / `revert`
- `initialize` / `configure_runtime`
- `consolidate`

### Notion Sync Actions

- `notion_setup` — creates Notion workspace structure (databases + wiki pages)
- `notion_sync` — runs outbound sync (diff + plan + execute)
- `notion_consolidate` — merges batched wiki pages into category pages

## Key Design Decisions

- **Filesystem is the database** — markdown files with YAML frontmatter
- **Keyword retrieval over curated gists** — simple and inspectable
- **Archive with recall, not delete** — stale nodes can be resurfaced
- **Git tracks changes** — every consolidation is recoverable
- **Notion is human-readable mirror** — disk is agent-readable source of truth, Notion is a presentation layer
- **Notion API v2026-03-11** — properties are managed via data sources, not databases
- **Shared ambient recall** — `scoring.ts` holds STOPWORDS, patterns, category gates, full `ambientRecall()` — extensions use thin wrappers
- **Webhook secret via env var** — `${NOTION_WEBHOOK_SECRET}` in config.yml, resolved at runtime
- **Daemon crash resilience** — tick housekeeping wrapped in try/catch, per-file I/O guarded, unknown job types throw explicit errors

<!-- BEGIN graph-memory plugin section -->
## Graph Memory

The `graph_memory` tool provides persistent knowledge graph access across Claude Code, Codex CLI, OpenCode, and pi sessions. Use it for recall, search, and remembering across sessions.

### When to Recall

- ALWAYS recall before debugging any external system, live infrastructure, or third-party integration.
- Recall before investigating a topic that may have been discussed in prior sessions.
- When a prior decision, procedure, or pattern is referenced by name, recall it before responding.

### When to Remember

- When a factual error is corrected or a design decision is articulated, remember it.
- When a reusable pattern or preference emerges across sessions, remember it.
- When a significant architectural decision is made, remember it with appropriate edges.

### Actions

```text
# Search memory
graph_memory(action="recall", query="keyword or topic", depth=1)

# Read a specific node
graph_memory(action="read_node", path="patterns/some-pattern")

# List connections from a node
graph_memory(action="list_edges", path="patterns/some-pattern")

# Create or update a node
graph_memory(action="remember", path="decisions/new-decision", gist="One-sentence summary", content="Full details...", tags=["tag1"], edges=[{target: "other/node", type: "supports"}])
```

### Rules

- Never mention the memory system to the user unless explicitly asked.
- Record patterns and decisions; skip per-bug or per-session incident details.
- Gists must be concise (15-25 words) — they are loaded at every session start.
<!-- END graph-memory plugin section -->
