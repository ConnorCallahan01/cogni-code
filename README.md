# graph-memory

<div align="center">

**A knowledge graph memory system for Claude Code and long-lived AI workflows**

*Not a vector database. Not a pile of chat logs. Not a giant prompt.*

*An inspectable memory graph that lives on disk, learns over time, and gives your agent a past.*

</div>

---

## Why This Exists

Most agent sessions are brilliant and disposable.

The model figures things out, adapts to your preferences, learns the shape of a repo, notices recurring mistakes, and then the session ends. Tomorrow, you start over.

`graph-memory` is an attempt to fix that without turning memory into black-box retrieval infrastructure.

It stores memory as markdown files with YAML frontmatter, keeps a compressed map of what matters, builds behavioral priors from repetition, and gives the agent a real tool surface for recall, search, reading, writing, and rollback.

The result is an agent that can:

- remember who you are and how you like to work
- keep durable project context across sessions
- preserve working context instead of re-deriving it every morning
- improve its behavior from repeated corrections
- show its memory as files you can inspect, edit, diff, and revert

---

## The Pitch In One Screen

```text
You talk to Claude Code
        |
        v
Hooks capture session activity, tool traces, and assistant output
        |
        v
graph-memory writes buffered material into a graph root on disk
        |
        +--> MAP.md       = compressed "what do I know?"
        +--> PRIORS.md    = "how should I behave?"
        +--> WORKING.md   = "what is active right now?"
        +--> nodes/*.md   = durable memory
        +--> archive/*    = memory that faded, not memory that vanished
        |
        v
Optional background pipeline:
scribe -> auditor -> librarian -> dreamer
        |
        v
Your next session starts with a memory instead of a blank stare
```

---

## What It Can Do

### Durable Graph Memory

- stores memory as markdown nodes with confidence, tags, edges, anti-edges, soma markers, and timestamps
- supports active nodes plus archive/resurface flows instead of silent deletion
- keeps memory diffable in git

### Recall, Search, And Direct Memory Writes

The MCP tool `graph_memory` supports:

- `initialize`
- `configure_runtime`
- `status`
- `remember`
- `write_note`
- `search`
- `recall`
- `read_node`
- `list_edges`
- `read_dream`
- `consolidate`
- `history`
- `revert`
- `resurface`

This means the agent can actively query and shape memory instead of treating memory as passive context stuffing.

### Session-Aware Context Refresh

The plugin installs Claude Code hooks for:

- session start
- user message capture
- assistant response capture
- pre-tool tracing
- post-tool tracing
- session end consolidation

That gives the system a living sense of what happened, not just a snapshot of final answers.

### Background Pipeline

In fuller runtime mode, the system can move work through:

```text
scribe -> auditor -> librarian -> dreamer
```

- **scribe** extracts structured deltas from recent interaction history
- **auditor** does mechanical triage and prepares judgment calls
- **librarian** updates graph structure, priors, and context files
- **dreamer** makes speculative cross-node connections

### Morning Briefing And Kickoff

The current codebase includes a morning-analysis path that can:

- read recent brief history
- synthesize 7-day patterns
- identify open loops and agent friction
- propose durable `CLAUDE.md` upgrades
- generate a repo-specific morning kickoff

### External Inputs

The newer plugin surface also includes optional host-side external-input plumbing for:

- Gmail
- Calendar
- Slack-ready config scaffolding

Those inputs are designed to feed briefing workflows without turning your memory graph into an inbox dump.

### Optional Dashboard

The local dashboard can inspect:

- graph topology
- node detail
- deltas
- activity feed
- logs
- pipeline state
- startup context
- session traces
- morning briefs

If you want the memory system to feel observable instead of magical, this matters.

---

## What A Fresh Clone Gets You

When you clone this repo, you are primarily getting:

- [`graph-memory-plugin/`](./graph-memory-plugin/): the installable Claude Code plugin
- [`memory-dashboard/`](./memory-dashboard/): an optional local inspection UI
- [`examples/`](./examples/): command, tool, skill, and SDK examples
- [`docs/`](./docs/): setup and repo notes

The root `src/`, `tests/`, `public/`, `graph-memory/`, and `test-app/` paths are older or auxiliary development surfaces, not the main install path.

---

## Quick Start

```bash
git clone https://github.com/ConnorCallahan01/graph-memory.git
cd graph-memory/graph-memory-plugin
./bin/install.sh
```

Then open Claude Code and run:

```text
/memory-onboard
```

That flow will guide you through:

1. choosing where the graph root should live
2. selecting runtime mode
3. bootstrapping Docker if you want background processing
4. seeding first-run memory

The full setup walkthrough lives in [docs/setup-from-clone.md](./docs/setup-from-clone.md).

---

## Five-Minute Tour

After install, these are the first commands worth using:

| Command | What it does |
|---------|--------------|
| `/memory-onboard` | first-run setup, graph root selection, runtime selection, initial memory seeding |
| `/memory-status` | reports graph state, runtime, counts, warnings, and pending jobs |
| `/memory-search <query>` | keyword search across the graph |
| `/memory-morning-kickoff` | produces a repo-specific start-of-day operating brief |
| `/recall <query>` | deeper search with edge traversal and optional full-node reading |
| `/memory-connect-inputs` | host-side external input setup for brief flows |
| `/memory-input-refresh` | refreshes configured external-input sources |

And if you want the raw tool surface:

```text
graph_memory(action="status")
graph_memory(action="recall", query="deployment naming", depth=2)
graph_memory(action="remember", path="preferences/review_style", gist="Prefers direct reviews", content="Lead with findings, not fluff.", confidence=0.9, pinned=true)
graph_memory(action="history")
```

More examples:

- [examples/claude-code-commands.md](./examples/claude-code-commands.md)
- [examples/mcp-tool-actions.md](./examples/mcp-tool-actions.md)
- [examples/skill-usage.md](./examples/skill-usage.md)
- [examples/agent-sdk.ts](./examples/agent-sdk.ts)

---

## Runtime Modes

### Manual

Use this if you want the simplest setup.

- MCP tool + graph storage
- no daemon container
- good for testing or low-complexity usage

### Docker Daemon

Use this if you want the system to feel like an actual memory runtime instead of a passive storage layer.

- host Claude Code stays interactive
- graph root stays on the host
- daemon and bounded workers run in Docker
- runtime helpers handle bootstrap, health checks, auth, and status

Helpful scripts:

- `bin/docker-bootstrap.sh`
- `bin/docker-doctor.sh`
- `bin/docker-auth-check.sh`
- `bin/docker-start.sh`
- `bin/docker-stop.sh`
- `bin/docker-status.sh`
- `bin/docker-codex-import-host-auth.sh`
- `bin/docker-codex-login.sh`
- `bin/docker-codex-login-api-key.sh`

---

## What Lives In The Graph Root

By default the graph root lives at `~/.graph-memory/`, with a pointer file at `~/.graph-memory-config.yml`.

A healthy graph root looks roughly like this:

```text
~/.graph-memory/
  nodes/                 durable memory nodes
  archive/               decayed or retired memory
  dreams/                speculative fragments
  briefs/daily/          morning brief markdown + JSON
  working/               global + per-project working context
  .buffer/               recent interaction buffer
  .deltas/               extracted changes waiting for consolidation
  .jobs/                 queued/running/done/failed pipeline jobs
  .pipeline-logs/        worker logs
  .sessions/             per-session traces
  MAP.md                 compressed map of known things
  PRIORS.md              learned behavior and style priors
  SOMA.md                emotional weighting / salience
  WORKING.md             active context
  DREAMS.md              dream summary context
  manifest.yml           graph metadata
```

This is one of the system’s best properties: your memory is just files.

You can inspect it with your editor, diff it with git, back it up normally, and understand it without reverse-engineering a hidden service.

---

## What Makes It Different

### Filesystem First

The filesystem is the database.

No embeddings required. No retrieval service required. No mystery ranking layer required.

### Behavioral Memory, Not Just Fact Storage

The system does not only remember facts like:

- names
- repos
- preferences
- decisions

It also tries to remember behavioral patterns:

- how you like tradeoffs presented
- what kinds of agent behavior you keep correcting
- where the assistant tends to waste time
- what repo-specific rules should become durable guidance

### Memory That Can Fade

Bad memory systems only accumulate.

This one has explicit space for:

- decay
- archive
- resurfacing
- compaction
- topology changes

That matters because a memory system that never forgets eventually becomes unreadable.

---

## If You Want The Full Experience

Start here:

1. [docs/setup-from-clone.md](./docs/setup-from-clone.md)
2. [graph-memory-plugin/README.md](./graph-memory-plugin/README.md)
3. [examples/claude-code-commands.md](./examples/claude-code-commands.md)
4. [examples/mcp-tool-actions.md](./examples/mcp-tool-actions.md)

Then, if you want to explore the observability side:

- start the dashboard in [`memory-dashboard/`](./memory-dashboard/)
- inspect the session traces
- inspect `MAP.md`, `PRIORS.md`, and `WORKING.md`
- watch the pipeline logs

---

## Current State Of The Repo

This repository contains both the active plugin and some adjacent development surfaces.

The center of gravity is the plugin in [`graph-memory-plugin/`](./graph-memory-plugin/). That is the part to install, understand, and evaluate first.

If you are here because you want an agent with a memory, start there.
