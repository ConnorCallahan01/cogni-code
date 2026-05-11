# Graph Memory v3 — Mental Model Architecture

## Overview

This spec describes a ground-up redesign of the graph-memory plugin's backend architecture. The current system (v2) is a graph database with a chat interface — 771 nodes, 53% below 0.4 confidence, injecting 11k tokens per session via 5 separate context files. It has a write-amplification problem (3,000+ I/O ops per pipeline cycle) and makes the user aware it exists through structured tool calls and visible context injection.

v3 replaces this with a **four-layer mental model architecture**:

1. **Global Mental Model** — who the user is (~300 tokens)
2. **Project Mental Models** — how they think about each project (~400 tokens)
3. **Session Logs** — what happened recently (~150 tokens)
4. **The Graph** — full detail, on demand (not injected)

Total passive injection: ~850 tokens. The agent just knows.

---

## Architecture

### Four-Layer Model

```
Layer 1: Global Mental Model
  - Cognitive style, decision patterns, preferences
  - Guardrails (anti-patterns — permanent, never decay)
  - Injected every session, ~300 tokens
  - Storage: mind/model.json, mind/whisper.txt

Layer 2: Project Mental Models
  - How the user thinks about this specific project
  - Tech stack, conventions, procedures, project-specific guardrails
  - Injected when project matches, ~400 tokens
  - Storage: lenses/{project}/model.json, lenses/{project}/whisper.txt

Layer 3: Session Logs
  - Factual log of recent sessions per project
  - Active work, decisions, blockers, open threads
  - Expires in 7-30 days based on age
  - Injected every session, ~150 tokens
  - Storage: sessions/{project}.jsonl

Layer 4: The Graph (Detailed Memory)
  - Granular nodes with full context
  - Queried on demand via recall/search, not injected
  - Categories: patterns, anti-patterns, decisions, preferences,
    procedures, corrections, projects, concepts, architecture, people, tools
  - Storage: graph/{category}/{node}.md + graph/.index.json
```

### Pipeline

```
v2 Pipeline (4 LLM passes per session):
  scribe → auditor → librarian → dreamer

v3 Pipeline (1-2 LLM passes per session):
  observer → compressor (periodic, not every session)

  observer:    watches conversation, writes observations + session logs + graph nodes
  compressor:  reads observations, folds into models, generates whispers
  dreamer:     periodic background job against compressed models + graph
  deep-audit:  on-demand full graph walk for bloat management
```

### Anti-Patterns

Anti-patterns are first-class citizens:
- Separate category: `graph/anti-patterns/`
- Higher confidence than patterns (typically 0.85-0.95)
- Never decay — `decay_exempt: true`
- Folded into whisper as guardrails
- Tagged with source session for traceability

### Harness Adapter Pattern

The core is harness-agnostic. Each harness (Claude Code, Codex, Pi, OpenCode) provides an adapter:

```typescript
interface HarnessAdapter {
  name: string;
  onSessionStart(cwd: string, sessionId: string): Promise<string>;
  onSessionEnd(sessionId: string): Promise<void>;
  injectContext(text: string): void;
}
```

Codex runs in degraded mode (MCP tools only, no hooks). Claude Code, Pi, and OpenCode get full automatic operation.

### Project Doc Bootstrap

New projects get bootstrapped from the global mental model:
- After first session, observer has enough signal to generate CLAUDE.md / AGENT.md
- Conventions inherit from user's global guardrails
- File format adapts to harness (claude → CLAUDE.md, opencode → AGENT.md)
- Compressor tracks drift between project doc and project model

---

## Storage Layout

```
~/.graph-memory/
  mind/
    observations.jsonl          ← raw global observations (append-only)
    model.json                  ← compressed global model
    whisper.txt                 ← pre-generated whisper (~300 tokens)

  lenses/
    {project}/
      observations.jsonl        ← project-specific observations
      model.json                ← compressed project model
      whisper.txt               ← project whisper (~400 tokens)
    _archived/                  ← dormant project lenses

  sessions/
    {project}.jsonl             ← session summaries per project

  graph/
    patterns/
    anti-patterns/
    decisions/
    preferences/
    procedures/
    corrections/
    projects/
    concepts/
    architecture/
    people/
    tools/
    .index.json                 ← query index for recall/search
    .archive/                   ← faded/obsolete nodes

  dreams/
    pending/
    integrated/

  .pipeline/
    observations/               ← pending observation batches
    jobs/                       ← job queue (queued/running/done/failed)
    logs/                       ← worker logs

  .sessions/                    ← raw session traces
  .git/                         ← full history
```

---

## Bloat Management

### Lifecycle Rules Per Layer

| Layer | Max Size | Prune Trigger | Prune Action |
|---|---|---|---|
| Observations (.jsonl) | 500KB per file | Compressor run | Delete absorbed > 30d |
| Session logs | 10 entries per project | Compressor run | Expire > 7d, delete > 30d |
| Graph nodes | 200 active (soft), 300 (hard) | Compressor + deep audit | Archive < 0.2 confidence (anti-patterns exempt) |
| Model files | 1,000 tok (global), 1,200 tok (project) | Every compressor run | Compress, fold details into graph |
| Whisper files | 400 tok (global), 500 tok (project) | Every compressor run | Hard cap enforced |
| Project lenses | 10 active | New project creation | Archive dormant > 14d, delete > 60d |

### Graph Node Lifecycle

```
Created → Active (> 0.4) → Fading (0.2-0.4) → Archived (< 0.2)

Rules:
- Anti-patterns: NEVER decay, NEVER archive
- Patterns/decisions: decay at 0.05 rate, archive at < 0.2
- Referenced by 2+ other nodes → decay paused
- Accessed in last 14 days → decay paused
- Archive > 90 days → eligible for deletion (user warning via status)
```

### Session Log Lifecycle

```
Written → Active (< 3 days) → Fading (3-7 days) → Expired (> 7 days)

Rules:
- < 3 days: full detail injected
- 3-7 days: summary only (compressed by compressor)
- > 7 days: only "decisions" and "shipped" kept
- > 30 days: fully deleted (important stuff is in graph/model)
```

---

## Structured Worker Tools

### Observer Tools

```typescript
observe({
  layer: "global" | "project",
  project?: string,
  observation: string,
  evidence: string[],
  confidence: number,
  type: "pattern" | "anti_pattern" | "preference" | "correction" |
        "decision" | "procedure" | "emotional" | "relational"
})

log_session({
  project: string,
  active_work: string[],
  shipped: string[],
  decisions: string[],
  blocked: string[],
  open_threads: string[],
  corrections_given: string[],
  next_session_should: string
})

upsert_node({
  path: string,
  category: string,
  gist: string,
  content: string,
  confidence: number,
  edges: Array<{target, type}>,
  anti_pattern?: boolean,
  tags: string[]
})
```

### Compressor Tools

```typescript
get_observations({ layer, project?, since? })
get_model({ layer, project? })
update_model({ layer, project?, content })
query_graph({ query, category?, limit? })
get_anti_patterns({ project? })
archive_observations({ ids })
prune_session_logs({ project?, older_than_days })
archive_graph_nodes({ paths, reason })
get_graph_stats()
flag_for_deep_audit({ reason })
```

### Dreamer Tools

```typescript
get_models({ layers })
get_graph_nodes({ category?, limit? })
get_anti_patterns({})
propose_dream({ fragment, references, reasoning })
```

### Bootstrap Tool

```typescript
bootstrap_project_doc({
  project: string,
  harness: string,
  cwd: string,
  observations: Obs[],
  global_model: Model,
  graph_nodes: Node[]
})
```

---

## Session Start Flow (New)

```typescript
async function sessionStart(cwd: string, sessionId: string): string {
  const project = detectProject(cwd);
  ensureProjectLens(project); // create if first session

  const globalWhisper = readOrGenerate("mind/whisper.txt");
  const projectWhisper = readOrGenerate(`lenses/${project}/whisper.txt`);
  const sessionLog = readRecent(`sessions/${project}.jsonl`, 3);

  const parts = [globalWhisper, projectWhisper, sessionLog].filter(Boolean);
  return parts.join("\n\n---\n\n");
}
```

Three file reads. No MAP regeneration. No index rebuild. No pinned node scanning.

---

## Implementation Phases

### Phase 0: Scaffolding and Core Types

Create the new directory structure, type definitions, and harness adapter interfaces. No behavior changes yet.

**Tasks:**

- [ ] Create `src/graph-memory/mind/` module with types for observations, models, whispers
- [ ] Create `src/graph-memory/lenses/` module for project mental model management
- [ ] Create `src/graph-memory/sessions/` module for session log management
- [ ] Define `HarnessAdapter` interface in `src/graph-memory/adapters/`
- [ ] Define structured tool schemas for observer, compressor, dreamer
- [ ] Create `src/graph-memory/pipeline/observer.ts` (empty shell)
- [ ] Create `src/graph-memory/pipeline/compressor.ts` (empty shell)
- [ ] Update `config.ts` with new paths (mind/, lenses/, sessions/, graph/) alongside existing paths
- [ ] Update `index.ts` to create new directory structure on init

### Phase 1: Observer

Build the observer — the replacement for the scribe. This is the first LLM pass that replaces the current scribe + auditor pipeline.

**Tasks:**

- [ ] Write observer agent prompt (`agents/memory-observer.md`)
  - Must be concise (~120 lines max) — structured tools handle the mechanics
  - Focus on: what to observe, what to ignore, how to classify layer/type
  - Include anti-pattern detection rules
- [ ] Implement observer structured tools (`pipeline/observer-tools.ts`)
  - `observe()` — validates, writes to observations.jsonl
  - `log_session()` — writes to sessions/{project}.jsonl
  - `upsert_node()` — writes/updates graph nodes
  - Each tool enforces schema validation
- [ ] Implement observer job in daemon (`pipeline/daemon.ts`)
  - New job type: "observer"
  - Same harness dispatch as current scribe (uses worker-runner.ts)
  - Writes structured tools module path in prompt
  - Validates output (observer must produce at least one observation or log_session)
- [ ] Wire observer into session-end hook (replace scribe enqueue with observer enqueue)
- [ ] Wire observer into buffer-watcher (replace scribe rotation with observer rotation)
- [ ] Add observer job type to job-queue priority map (priority 0, same as scribe)

### Phase 2: Compressor

Build the compressor — reads observations, produces mental models and whispers. Runs periodically, not every session.

**Tasks:**

- [ ] Write compressor agent prompt (`agents/memory-compressor.md`)
  - Reads pending observations, current model, relevant graph nodes
  - Folds new observations into model
  - Handles contradictions (re-evaluate, don't just append)
  - Enforces model size caps
  - Handles bloat: prune observations, trim session logs, archive graph nodes
- [ ] Implement compressor structured tools (`pipeline/compressor-tools.ts`)
  - `get_observations()`, `get_model()`, `update_model()`
  - `query_graph()`, `get_anti_patterns()`
  - `archive_observations()`, `prune_session_logs()`
  - `archive_graph_nodes()`, `get_graph_stats()`, `flag_for_deep_audit()`
- [ ] Implement compressor job in daemon
  - New job type: "compressor"
  - Trigger: after N observer completions (configurable, default 5)
  - Also triggerable on demand via MCP action
  - Generates whisper.txt files as output
- [ ] Implement whisper generation
  - `generateWhisper(model, antiPatterns)` → compressed ~300 token paragraph
  - `generateProjectWhisper(projectModel, globalAntiPatterns)` → ~400 token paragraph
  - Both write to whisper.txt files
- [ ] Implement graph node archival in compressor
  - Archive nodes < 0.2 confidence (except anti-patterns)
  - Rebuild graph index after archival
  - Pause decay for referenced/recently-accessed nodes
- [ ] Implement observation pruning
  - Delete observations > 30d that were absorbed into model
  - Hard cap on observations.jsonl size (500KB)

### Phase 3: Session Start Redesign

Replace the current 5-file injection with the whisper model.

**Tasks:**

- [ ] Rewrite `session-start.ts` to read whisper files
  - Read `mind/whisper.txt`
  - Read `lenses/{project}/whisper.txt`
  - Read `sessions/{project}.jsonl` (last 3 entries)
  - Total: 3 file reads instead of current ~50+
- [ ] Add project lens creation on first session
  - If no lens exists for detected project, create lens directory
  - Seed with empty model.json
- [ ] Update context budget enforcement
  - Global whisper: hard cap 400 tokens
  - Project whisper: hard cap 500 tokens
  - Session log: hard cap 200 tokens
  - Total: hard cap 1,100 tokens
- [ ] Update hooks to pass through to harness adapters
  - Claude Code: stdout (same as current)
  - OpenCode: client.session.prompt (same as current)
  - Pi: client.session.prompt (same as current)
- [ ] Keep MCP tool registration for `graph_memory` — it still works for Layer 4 queries

### Phase 4: Graph Layer (Layer 4) Redesign

Redesign the graph for efficient on-demand querying. The graph stays but becomes a pull-only layer.

**Tasks:**

- [ ] Redesign graph index for O(1) lookups
  - Replace flat JSON array with Map-keyed structure
  - Key: node path → value: index entry
  - Support category-based filtering
  - Support project-based filtering
  - Lazy load, cache with invalidation
- [ ] Implement incremental index updates
  - `addToIndex(nodePath, entry)` — single node add/update
  - `removeFromIndex(nodePath)` — single node remove
  - `rebuildIndex()` — full rebuild (only on deep audit)
  - No more full rebuild on every remember/recall/consolidation
- [ ] Remove `fullRegenerateMAP()` from remember/recall paths
  - MAP is replaced by whispers — no more MAP.md
  - Index updates are incremental
- [ ] Implement efficient recall/search
  - Read from index (in-memory), not from individual files
  - Full node content read only on explicit `read_node` or single result
  - Archive fallback uses archive index (loaded once, cached)
- [ ] Update `tools.ts` — fix confidence default from 0.5 to 0.6
- [ ] Remove triple regeneration in pipeline
  - No more regenerateCoreContextFiles after every librarian/dreamer
  - Compressor handles model regeneration, not the pipeline

### Phase 5: Anti-Patterns

First-class anti-pattern support across all layers.

**Tasks:**

- [ ] Add `anti_patterns` category to graph node conventions
- [ ] Implement `decay_exempt` flag in decay logic — anti-patterns never decay
- [ ] Implement anti-pattern injection in whisper generation
  - Global anti-patterns → global whisper guardrails section
  - Project anti-patterns → project whisper guardrails section
  - Format: "GUARDRAILS:\n- Rule 1\n- Rule 2\n..."
- [ ] Update observer to classify corrections as anti-patterns
  - When user corrects agent → observer creates anti-pattern observation
  - Anti-pattern observations get confidence floor of 0.85
- [ ] Add anti-pattern visibility to `graph_memory` status action
  - Show count of active anti-patterns
  - Show which are global vs project-scoped

### Phase 6: Project Doc Bootstrap

Generate project root .md files (CLAUDE.md / AGENT.md) from mental models.

**Tasks:**

- [ ] Implement `bootstrap_project_doc` tool
  - Takes: project name, harness, cwd, observations, global model, graph nodes
  - Generates: harness-appropriate file (CLAUDE.md / AGENT.md)
  - Writes to project root
  - Seeds project lens with initial model
- [ ] Add bootstrap trigger to observer
  - After first session in new project: if ≥5 observations captured → queue bootstrap job
- [ ] Add bootstrap trigger to MCP tool
  - `graph_memory(action="bootstrap")` — explicit trigger
- [ ] Implement project doc drift detection in compressor
  - Compare current CLAUDE.md/AGENT.md to project model
  - Flag if model has significant additions not in doc
  - Don't auto-overwrite — surface in status
- [ ] Add `<!-- custom -->` section preservation
  - Hand-edited sections in project docs are preserved during re-bootstrap
- [ ] Harness-aware file naming
  - claude → CLAUDE.md (or .claude/CLAUDE.md)
  - opencode → AGENT.md
  - codex → AGENT.md
  - pi → AGENT.md
  - If CLAUDE.md already exists and harness is opencode → reuse, don't duplicate

### Phase 7: Dreamer Redesign

Adapt the dreamer to work against compressed models instead of the raw node graph.

**Tasks:**

- [ ] Rewrite dreamer prompt (`agents/memory-dreamer.md`)
  - Input: global model + project model + sample graph nodes + anti-patterns
  - Looks for surprising connections between compressed model entries
  - Uses anti-patterns as "dream around" constraints — what if the opposite were true?
- [ ] Implement dreamer structured tools
  - `get_models()`, `get_graph_nodes()`, `get_anti_patterns()`, `propose_dream()`
- [ ] Update dreamer job in daemon
  - Triggered after compressor completion (not after librarian — librarian is gone)
  - Also periodic: every 5 sessions if no compressor triggered it
- [ ] Update dream reinforcement
  - When a node referenced by a dream is accessed → bump dream confidence
  - Max confidence for reinforced dreams: 0.65 (was 0.55 — too low)

### Phase 8: Harness Adapters

Implement the adapter pattern for all four harnesses.

**Tasks:**

- [ ] Implement Claude Code adapter
  - session-start: stdout injection (same as current hooks.json)
  - session-end: flush buffer, enqueue observer
  - tools: MCP server (same as current)
  - project detection: cwd from hook stdin
- [ ] Implement OpenCode adapter
  - session-start: client.session.prompt injection
  - session-end: flush buffer, enqueue observer
  - tools: plugin-native tool registration
  - project detection: cwd from plugin event
- [ ] Implement Pi adapter
  - session-start: client.session.prompt injection
  - session-end: plugin lifecycle event
  - tools: plugin-native tool registration
  - project detection: cwd from plugin event
- [ ] Implement Codex adapter (degraded mode)
  - session-start: none (no hooks available)
  - session-end: daemon watches for orphaned buffers
  - tools: MCP server
  - project detection: cwd from process
- [ ] Refactor existing extensions to use adapters
  - `extensions/graph-memory.ts` (Pi) → uses Pi adapter
  - `extensions/graph-memory-opencode.ts` → uses OpenCode adapter
  - `src/hooks/session-start.ts` → uses Claude Code adapter
  - `src/hooks/session-end.ts` → uses Claude Code adapter

### Phase 9: Migration

Migrate existing graph data to the new format.

**Tasks:**

- [ ] Implement migration script (`bin/migrate-v2-to-v3.sh` or TS equivalent)
  - Read existing nodes from ~/.graph-memory/nodes/
  - Run a one-time "bootstrap compressor" pass
  - Generate initial mind/model.json from high-confidence nodes
  - Generate initial project models from project-tagged nodes
  - Generate initial whispers
  - Copy nodes to graph/ directory structure
  - Preserve existing archive/ directory
- [ ] Run migration against current live data (~771 nodes)
  - Verify generated whisper quality
  - Verify graph recall still works
  - Verify anti-patterns are correctly identified
- [ ] Keep v2 paths functional during transition
  - Both old and new paths work simultaneously
  - Feature flag: `GRAPH_MEMORY_V3=1` enables new system
  - Default: v2 active, v3 in shadow mode (runs but doesn't inject)

### Phase 10: Cleanup and Removal

Remove v2 code after v3 is validated.

**Tasks:**

- [ ] Remove old pipeline components:
  - `pipeline/spawn.ts` (already deprecated)
  - `pipeline/librarian.ts` (replaced by compressor)
  - Old scribe-related code in daemon.ts
- [ ] Remove old context file generation:
  - MAP.md generation (replaced by whispers)
  - PRIORS.md (replaced by global model)
  - SOMA.md (replaced by global model emotional section)
  - WORKING.md (replaced by session logs)
  - DREAMS.md (dreamer writes directly)
- [ ] Remove old agent prompts:
  - memory-scribe.md (replaced by memory-observer.md)
  - memory-auditor.md (replaced by compressor)
  - memory-librarian.md (replaced by compressor)
- [ ] Update dashboard to new data model
  - Show mental model, project lenses, session logs
  - Show anti-patterns as separate view
  - Show observation stream
  - Keep graph explorer for Layer 4
- [ ] Remove feature flag — v3 is the only path
- [ ] Update documentation (README, CLAUDE.md, PRODUCT.md)

---

## Phase Dependency Graph

```
Phase 0 (types/structure)
  │
  ├──► Phase 1 (observer)
  │      │
  │      └──► Phase 2 (compressor)
  │             │
  │             ├──► Phase 3 (session start redesign)
  │             │
  │             ├──► Phase 5 (anti-patterns)
  │             │
  │             └──► Phase 7 (dreamer redesign)
  │
  ├──► Phase 4 (graph redesign)  [independent of 1-3]
  │
  ├──► Phase 6 (project doc bootstrap) [depends on 1, 2]
  │
  └──► Phase 8 (harness adapters) [depends on 3]

Phase 9 (migration) [depends on 1-8]
  │
  └──► Phase 10 (cleanup) [depends on 9]
```

Phase 4 (graph redesign) and Phases 1-3 (observer/compressor/session-start) can be built in parallel.

---

## Open Questions

### Architecture

1. **Compressor prompt design.** We've defined the tools but not the actual compression logic. How does the compressor decide what to fold, what to keep, what to discard? This needs a detailed prompt design pass. The prompt needs to handle:
   - Observations that reinforce existing model entries (strengthen, don't extend)
   - Observations that contradict (re-evaluate the model entry)
   - Observations about something entirely new (add tentatively)
   - Model entries getting verbose (compress aggressively)
   - Deciding when an observation is "absorbed" vs still needs to exist separately

2. **Observation quality control.** The observer is more open-ended than the current scribe. Bad observations compress into bad model entries which become bad whispers. No human-in-the-loop exists yet. Options:
   - Confidence threshold: only fold observations > 0.7 into model
   - Multi-observer: run observer twice and only keep observations both agree on (expensive)
   - User correction: when user corrects something the whisper caused, downgrade the source observation
   - Trust gradient: new observations are tentative until reinforced by 2+ sessions

3. **Cold start problem.** The system is minimal for the first 2-3 sessions in a new project. The global whisper helps (guardrails carry over) but the project whisper is empty. Mitigation options:
   - Bootstrap the project whisper from the first session more aggressively
   - Allow the agent to query the graph on first session even without a whisper
   - Accept that 2-3 sessions of "getting to know you" is natural and correct

4. **Migration fidelity.** Converting 771 existing nodes into a mental model is lossy. Some nodes will compress well, others won't. The migration needs to:
   - Preserve anti-patterns at full fidelity
   - Preserve high-confidence nodes (> 0.7) as graph entries
   - Attempt to compress low-confidence nodes into model entries
   - Allow manual review of the generated model before activation

### Concurrency and Correctness

5. **Concurrent session handling.** Patrick might have Claude Code open on keel3_demo while OpenCode is running on agent_memory. Both trigger session start simultaneously. The core needs:
   - No cross-project race conditions (each lens is independent)
   - Global model updates are atomic (one compressor run at a time)
   - Observer jobs can run in parallel (per-session, no conflicts)
   - Graph index updates are atomic (file lock or append-only)

6. **Locking model.** The current system has a daemon lock and a consolidation lock. The new system needs:
   - Daemon lock (same — one daemon per graph root)
   - Compressor lock (only one compressor run at a time — it rewrites model files)
   - No observer lock needed (append-only writes)
   - Graph index lock for incremental updates

### Performance

7. **Graph index structure.** We kept the graph but didn't redesign the index beyond "use a Map." Specific questions:
   - Should the index be a single JSON file or multiple per-category files?
   - Should we use a real embedded DB (SQLite, LMDB) instead of JSON?
   - How large can the index get before read performance degrades?
   - Should the index be memory-mapped or loaded entirely?

8. **Whisper generation cost.** The compressor generates whispers. If the compressor runs every 5 sessions, the whisper could be up to 5 sessions stale. Is that acceptable? Options:
   - Generate whisper after every session (more LLM cost, fresher context)
   - Generate whisper on session start (computation during injection — defeats the "3 file reads" goal)
   - Hybrid: compressor generates whisper, but session start can trigger a quick refresh if model changed since last whisper generation

9. **Observer LLM cost.** The current scribe runs once per 10-message rotation. The observer runs at the same cadence. But the observer produces more output (observations + session log + graph nodes) than the scribe (deltas only). Is the observer more expensive per run? Need to benchmark.

### Scoping Gaps

10. **Dashboard redesign.** The memory dashboard shows the current graph/pipeline. It needs significant frontend work to show mental models, project lenses, session logs, and anti-patterns. This is a full frontend redesign not scoped here.

11. **Ambient recall.** The current Pi and OpenCode extensions scan the graph on every user message and inject relevant nodes. Does this survive in v3? The whisper handles most cases, but for deep queries, ambient recall of the graph might still be valuable. Need to decide whether to keep, remove, or redesign this feature.

12. **Multiple projects in one session.** If Patrick opens agent_memory but then cd's into a subdirectory that's a different git repo, does the project context switch? The current system doesn't handle this well. The new system should at least detect project changes mid-session.

13. **Explicit memory commands.** The user can currently call `graph_memory(action="remember", ...)` to explicitly store knowledge. This still works against Layer 4 (the graph). But should explicit remember also update the project model immediately? Or wait for the next compressor run? The tradeoff is freshness vs. cost.

14. **Dreamer input size.** The current dreamer reads the full MAP. The new dreamer reads compressed models. But compressed models might be too abstract for creative connections. Should the dreamer also sample graph nodes for detail? How many? This affects LLM cost.

15. **Project doc update workflow.** When the compressor detects project doc drift, it flags it. But the actual update requires writing a file to the project root (outside ~/.graph-memory/). This crosses a security boundary. Need to design the update flow — probably through the MCP tool, not automatically.

16. **Testing strategy.** The current system has thin test coverage. The new system needs integration tests for:
    - Observer → observations written correctly
    - Compressor → model compression preserves key insights
    - Whisper → stays under token budget
    - Anti-patterns → never decay
    - Session start → correct whisper for project
    - Migration → v2 data produces valid v3 model
    These tests don't exist yet and aren't scoped in the phases above.

17. **Skillforge.** The current system has a skillforge pipeline that converts high-access nodes into installable agent skills. This feature is not addressed in v3. It needs to be adapted to work against the new graph structure, but the core logic (score candidates, generate skill files) should still apply.

18. **External inputs.** The current system has Gmail/Calendar/Slack input normalization. This is a separate subsystem that feeds into the graph. It's not affected by the v3 redesign architecturally, but the pipeline integration (how external inputs trigger observations) needs to be defined.

19. **Memory sharing.** Can two users share a graph? Can a team have a shared project mental model? This is out of scope for v3 but the data model should not prevent it in the future.

20. **Undo/revert.** The current system uses git for rollback. The new system should too. But the mental model files (model.json, whisper.txt) are regenerated by the compressor — reverting them might conflict with the next compressor run. Need to define what "revert" means for compressed models.
