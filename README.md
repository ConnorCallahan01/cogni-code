# Cogni-Code

<div align="center">

<img src="docs/branding/cogni-code-logo.svg" alt="Cogni-Code" width="640" />

**Give your AI agent a memory that outlasts the session.**

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

Every time you start a new session, your agent starts from zero. It forgets your preferences, your decisions, the bug you spent two hours on yesterday, the deployment strategy you settled on last week. Cogni-Code fixes that.

It is a persistent, inspectable memory system for Claude Code, Codex CLI, OpenCode, pi, and any MCP-compatible agent. Your agent learns how you work across sessions and gets sharper every time you use it. Memory lives as plain files on your disk. You can read it, edit it, diff it, and back it up with git.

---

## Contents

- [What makes it different](#what-makes-it-different)
- [Install](#install)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [The memory model](#the-memory-model)
- [The background pipeline](#the-background-pipeline)
- [Notion sync](#notion-sync)
- [Skills](#skills)
- [Dashboard](#dashboard)
- [Tool reference](#tool-reference)
- [Slash commands](#slash-commands)
- [Where memory lives](#where-memory-lives)
- [Project structure](#project-structure)
- [Read next](#read-next)

---

## What makes it different

Most agent memory falls into one of three camps:

- **Built-in memory** (ChatGPT memory, Claude's saved context) is opaque, vendor-controlled, and locked to one product.
- **Vector-DB memory** (mem0, Letta, Zep) stores embeddings in a database. Powerful retrieval, but you cannot read what your agent knows without a UI.
- **Hand-written context files** (`CLAUDE.md`, `AGENT.md`, `.cursorrules`) give you full control but require you to write and maintain them by hand.

Cogni-Code is a fourth option: **plain files on disk, maintained automatically, capturing behavior rather than just facts.**

| | Cogni-Code | Built-in memory | Vector-DB memory | Hand-written files |
|---|---|---|---|---|
| **Where it lives** | Your filesystem | Vendor cloud | Database / SaaS | Your repo |
| **Can you read it?** | Yes (`cat`, grep, diff) | Limited UI | Partial | Yes |
| **Self-hosted** | Yes | No | Sometimes | Yes |
| **Maintained by** | Background pipeline | Vendor | Agent or app | You, manually |
| **Captures** | Behavior + facts | Mostly facts | Mostly facts | Whatever you write |
| **Decays when stale** | Yes | No | Usually no | No |
| **Multi-agent** | Yes (Claude, OpenCode, pi, Codex) | No | Sometimes | Manual |
| **Generates its own tools** | Yes (Skillforge) | No | No | No |
| **Git-backed history** | Yes | No | Rarely | If you commit it |

Five ideas drive the design:

1. **Filesystem is the database.** Every memory is a markdown file with YAML frontmatter. No vector store, no opaque ranking. You can `cat` what your agent knows.
2. **Behavioral, not just factual.** The pipeline tries to capture how you think, not just what you said. Evolving opinions, recurring corrections, half-formed decisions. Facts are easy. Patterns are the prize.
3. **Memory decays.** Nodes lose confidence when unused. Stale knowledge archives itself. `resurface` brings it back. Memory that only grows becomes noise.
4. **It writes its own tools.** Skillforge watches for memories you keep recalling and converts them into executable slash commands. Your agent generates workflows from what it keeps looking up.
5. **Git tracks every change.** Every consolidation is a commit. Inspect what changed, revert mistakes, diff between sessions. Your memory has a real history.

---

## Install

**npm (recommended):**

```bash
npm install -g cogni-code
cogni-code install
```

Auto-detects Claude Code, Codex CLI, and OpenCode. Initializes graph memory at `~/.graph-memory/` if needed. For a custom location: `cogni-code install --graph-root /path/to/memory`.

**With background pipeline (Docker):**

```bash
npm install -g cogni-code
cogni-code install --docker
```

Sets up the Docker daemon that runs the scribe/librarian/dreamer pipeline automatically. Requires Docker Desktop or Podman. Auto-detects the worker provider (codex, claude, or opencode) or specify with `--worker codex`.

Updates are automatic — `npm update -g cogni-code` updates all hooks instantly (they call the `cogni-code` CLI, not absolute file paths).

**From source (git clone):**

```bash
git clone https://github.com/ConnorCallahan01/cogni-code.git
cd cogni-code/graph-memory-plugin
npm install && npm run build

./bin/install.sh           # Claude Code
./bin/install-codex.sh     # Codex CLI
./bin/install-opencode.sh  # OpenCode
```

Then start a session and run:

```text
/memory-onboard
```

The onboard wizard walks you through runtime mode and seeds your first memory nodes. (If you installed via npm, the graph is already initialized — onboarding is optional.)

---

## Quick start

```text
# 1. Initialize
/memory-onboard

# 2. Teach it something
graph_memory(
  action="remember",
  path="preferences/deployment",
  gist="Always use blue-green deploys for production services",
  content="Blue-green for prod. Canary for staging. Never direct push.",
  tags=["preferences", "deployment"],
  confidence=0.9
)

# 3. Recall it next session, or next week
/recall deployment strategy

# 4. Check what your agent knows
/memory-status

# 5. See the full history
graph_memory(action="history")
```

That is the whole loop. Write memory, retrieve memory, inspect memory. The background pipeline handles the rest.

---

## How it works

Cogni-Code runs a continuous loop with four phases: **capture, process, inject, evolve**.

```
  your conversation
        │
        ▼
  ┌──────────────┐     ┌───────────────┐
  │ session hooks │────▶│ graph_memory  │   ← MCP tool you call directly
  │ capture state │     │ tool surface  │     (remember, recall, search...)
  └──────────────┘     └──────┬────────┘
                              │
                 ┌────────────▼────────────┐
                 │     background pipeline  │
                 │                          │
                 │  scribe → auditor →      │   ← active pipeline (always runs)
                 │  librarian → dreamer     │
                 │                          │
                 │  observer (writes to     │   ← always active, single node store
                 │  nodes/ alongside main)  │
                 │                          │
                  │  compressor, dreamer    │   ← code present, not active by default
                 └────────────┬────────────┘
                              │
                 ┌────────────▼────────────┐
                 │     ~/.graph-memory/     │
                 │                          │
                 │  mind/model.json         │   ← cognitive profile (always active)
                 │  lenses/{project}/       │   ← project models (always active)
                 │  sessions/{project}.jsonl│   ← session logs (always active)
                 │  nodes/                  │   ← knowledge graph (canonical store)
                 │  dreams/                 │   ← creative associations
                 └─────────────────────────┘
```

**Capture.** Session hooks watch your conversations and tool traces. Nothing is sent anywhere. The hooks write to a local buffer.

**Process.** The scribe extracts structured deltas from the buffer. The auditor detects stale and contradictory nodes. The librarian applies judgment-heavy updates with a prune-over-preserve philosophy. The dreamer creates speculative cross-node associations. None of this is your agent trying to manage its own memory. It is a separate pipeline that runs after the fact.

**Inject.** The next session starts with layered context: who you are (mental model), how this project works (project lens), what happened recently (session log), and what is most relevant (per-project knowledge index). The total cost is a few thousand tokens. Your agent resumes where the last one left off instead of reconstructing the world from scratch.

**Evolve.** Memory decays when unused. Nodes archive gracefully. Dreams surface unexpected connections. Skillforge promotes frequently-recalled memories into slash commands. Everything is git-backed and reversible.

---

## The memory model

Cogni-Code stores memory in four layers, each serving a different purpose. The layering is the whole point: a small, always-loaded profile sits on top of a large, on-demand knowledge graph.

### Layer 1: Mind (always loaded)

`mind/model.json` is a compact profile of *how you work*. Cognitive style, decision patterns, preferences, guardrails, emotional profile. This is loaded at the start of every session, unconditionally. It is the difference between an agent that knows you and an agent that knows facts about you.

The system is a single unified architecture. Mental model data is always active:

`lenses/{project}/` holds per-project context. Tech stack, conventions, active work, open threads. When you switch projects, the lens switches too. Your Keel3 context does not leak into your OpenPatient work.

### Layer 3: Session logs (recent history)

`sessions/{project}.jsonl` is an append-only log of what shipped, what was decided, what is blocked, and what the next session should pick up. This is the short-term memory. It rolls forward as you work.

### Layer 4: Knowledge graph (on-demand)

`nodes/` is the durable long-term memory: markdown files organized by category (`decisions/`, `patterns/`, `corrections/`, `procedures/`, etc.), each with YAML frontmatter, edges to other nodes, and a confidence score. This is searchable via `recall` and `search` but not loaded wholesale. It grows over time, decays when unused, and is the substrate the rest of the system reads from.

```
always-loaded  ┌─────────────────────────┐
               │ mind/model.json         │  ~400 tokens
               │ + project lens          │  ~300 tokens
               │ + recent session log    │  ~150 tokens
               └─────────────────────────┘
on-demand      ┌─────────────────────────┐
               │ nodes/ (knowledge graph)│  thousands of nodes
               │ searched via recall     │  only relevant slices loaded
               └─────────────────────────┘
```

The top three layers are small, opinionated, and always injected. The graph is large, searchable, and retrieved only when needed. This is how you keep a rich memory without blowing the context window.

---

## The background pipeline

The pipeline runs in the background so your agent does not have to manage its own memory mid-conversation. Most of it happens automatically. You talk. It learns.

| Stage | What it does |
|-------|-------------|
| **Scribe** | Extracts structured deltas from conversation buffers. Captures evolving opinions, frustrations, and contradictions, not just hard facts. |
| **Auditor** | Mechanical triage. Detects stale nodes, contradictions, and noise candidates. |
| **Librarian** | Applies judgment-heavy graph updates with a prune-over-preserve philosophy. Regenerates context files. |
| **Dreamer** | Creates speculative cross-node associations via creative recombination. |
| **Observer** | Produces structured observations from conversation patterns. Writes to the shared `nodes/` store. |
| **Skillforge** | Promotes frequently-accessed nodes into executable slash command skills. |
| **Bootstrap** | Auto-generates project docs (`CLAUDE.md`, `AGENT.md`) from mental model data. |
| **Working update** | Extracts key files from tool traces to prime the next session with what you actually edited. |

The pipeline runs either in **manual mode** (just the tool, no daemon) for lightweight local testing, or **Docker daemon mode** (recommended) where the host agent stays on your machine and bounded workers run in a container against the mounted graph root.

---

## Notion sync

Two-way sync between your graph memory and a Notion workspace. Browse, edit, and organize your agent's memory in a human-readable interface. Edits flow back.

- **Outbound.** Graph state mirrors to Notion. Knowledge nodes become wiki pages. Decisions and briefs become database rows.
- **Inbound.** Human edits in Notion are detected and turned into observations and deltas. Never direct node mutations.
- **Three-way merge.** When both sides change, human intent wins. Agent information is preserved as callouts.
- **Five steward agents** manage scoped sync areas: knowledge, projects, tasks, enrichment, and workspace structure.
- **Chunked sync.** 100 items per batch, sorted by confidence. The daemon auto-enqueues the next batch.

```text
/notion-setup       # create the Notion workspace structure
/notion-sync        # run outbound sync: diff → plan → execute
/notion-consolidate # merge batched wiki pages into category pages
```

Disk is the agent-readable source of truth. Notion is the human-readable presentation layer. Triggered daily by the daemon (configurable hour), or manually via slash command.

---

## Skills

Cogni-Code ships with skills that become part of how your agent operates. They are not plugins you configure. They are slash commands and tools your agent uses directly.

### Built-in slash commands

| Command | What it does |
|---------|-------------|
| `/memory-onboard` | First-run setup: storage, runtime, seed memory |
| `/memory-status` | Graph health snapshot. Node counts, confidence, warnings |
| `/memory-search <query>` | Keyword search across all knowledge |
| `/recall <query>` | Deep graph lookup with edge traversal (Claude Code skill) |
| `/memory-morning-kickoff` | Start-of-day briefing built from your memory |
| `/memory-wire-project` | Inject memory context into your project's `CLAUDE.md` or `AGENT.md` |
| `/memory-switch-harness` | Switch background pipeline worker (codex, claude, pi, opencode) |
| `/memory-connect-inputs` | Configure external inputs (Gmail, Calendar, Slack) for briefings |
| `/memory-input-refresh` | Refresh configured external input sources |
| `/refresh-skill` | Update a Skillforge-generated skill whose source node has drifted |
| `/skill-install` | Install Skillforge-generated skills into the current project |
| `/notion-setup` | Create Notion workspace structure |
| `/notion-sync` | Run outbound sync (diff → plan → execute) |
| `/notion-consolidate` | Merge batched wiki pages into category pages |

### Auto-generated skills (Skillforge)

Skillforge watches your memory graph for nodes that get accessed frequently. Patterns you keep recalling. Procedures you keep following. Decisions you keep referencing. When a node crosses a scoring threshold, it gets converted into an executable slash command skill.

Your agent literally writes its own tools based on what it keeps looking up. Skills auto-refresh when the source node content changes.

```text
# This happens automatically:
# 1. You recall "ssh provisioning" across 8 sessions
# 2. Skillforge converts it into a /provision-ssh slash command
# 3. Next time, your agent just runs the skill
```

### Included agent skills

The plugin ships with a `graph-memory` skill that teaches your agent when and how to use memory. When to recall before debugging. When to remember a corrected mistake. When to record a decision. Your agent is memory-literate out of the box.

---

## Dashboard

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

---

## Tool reference

The `graph_memory` MCP tool is the primary interface. Your agent uses it directly.

| Action | Description |
|--------|-------------|
| `remember` | Create or update a durable memory node |
| `recall` | Search plus multi-hop edge traversal |
| `search` | Keyword search over the graph index |
| `read_node` | Read a specific node by path |
| `list_edges` | See connections from a node |
| `write_note` | Save a working note into the session buffer |
| `read_dream` | Read pending dream fragments |
| `status` | Graph health, runtime state, node counts |
| `history` | Git-backed change log |
| `revert` | Roll back to an earlier state |
| `resurface` | Restore an archived node to active memory |
| `initialize` | Create graph structure and pointer file |
| `configure_runtime` | Choose manual or Docker runtime |
| `consolidate` | Run consolidation manually |
| `notion_setup` | Create Notion workspace structure |
| `notion_sync` | Run outbound sync (diff + plan + execute) |
| `notion_consolidate` | Merge batched wiki pages into category pages |

---

## Slash commands

Installed for Claude Code, Codex CLI, and OpenCode during setup. See [Skills](#skills) for the full list.

---

## Where memory lives

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

---

## Project structure

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

---

## Read next

- **[Setup guide](docs/setup-from-clone.md)** — detailed clone-to-first-memory walkthrough
- **[Plugin README](graph-memory-plugin/README.md)** — full architecture, configuration, and pipeline internals
- **[Examples](examples/)** — commands, tool actions, skill usage, SDK integration
- **[CHANGELOG](graph-memory-plugin/CHANGELOG.md)** — version history

---

If you are here because you want an agent that remembers, you are in the right place.
