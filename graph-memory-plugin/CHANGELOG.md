# Changelog

## [3.4.1] (2026-07-14) — README fix + CI npm auto-publish

### Fixed

- **README stale reference** — Harness Adapters section listed Codex as "MCP only, degraded mode" (fixed to "hooks + MCP" after the 3.3.0 first-class promotion).

### Changed

- **CI auto-publish via npm Trusted Publishing** — the release workflow now publishes to npm automatically when a new version lands on master, using OIDC-based Trusted Publishing (no long-lived token secret). Adds SLSA provenance attestation on every publish.

## [3.4.0] (2026-07-14) — npm Package (cogni-code) + CLI Dispatcher

### Added

- **npm package as `cogni-code`** — the plugin is now distributable via `npm install -g cogni-code` with automatic updates (`npm update -g cogni-code` updates all hooks immediately since they call the `cogni-code` CLI, not absolute file paths).
  - New CLI dispatcher (`src/graph-memory/cli.ts`) with subcommands: `install`, `hook <event>`, `mcp`, `status`, `--version`. The `bin` field now points here instead of the raw MCP server.
  - New install modules (`src/graph-memory/install/`) — Node-based harness detection + registration for Codex, Claude Code, and OpenCode. Auto-detects installed harnesses or accepts `--claude`/`--codex`/`--opencode`/`--all` flags.
  - Hook registrations use `cogni-code hook <event>` commands instead of absolute `.sh` paths, so code updates propagate without re-running install.
  - MCP registered as `command = "cogni-code", args = ["mcp"]` — version-independent.
  - Claude Code install symlinks the package into `~/.claude/plugins/` so the existing manifest handles hooks/MCP/commands/discovery.
  - Codex install merges hooks into `~/.codex/hooks.json` using CLI commands, including the `PreCompact` compaction-boundary flush.
  - `--docker` flag configures Docker daemon mode: detects Docker/Podman, saves runtime config, and runs `docker-bootstrap.sh` to build the image, start the container, and import worker auth. Auto-detects worker provider (codex/claude/opencode) or accepts `--worker <provider>`.
  - Graph initialization: auto-detects existing graph via `~/.graph-memory-config.yml` pointer, preserves on re-install/update, or initializes new at `~/.graph-memory/` (or custom `--graph-root <path>`).

### Changed

- **Package name `graph-memory` → `cogni-code`** — npm package name and CLI command updated. The MCP tool name remains `graph_memory` (what the LLM calls) and the Claude Code plugin manifest name remains `graph-memory` (for existing-install compatibility).
- **`postinstall` → `prepare`** — standard npm lifecycle: builds on git clone and before publish, but not when installed as a dependency by consumers (dist ships pre-built).
- **`peerDependenciesMeta`** — pi and typebox peer deps marked optional so non-pi installs don't show warnings.
- **`files` whitelist** — added `CHANGELOG.md`.
- **`engines.node`** — requires Node 18+.
- **README** — updated with npm install instructions, Codex support, and CLI usage.

## [3.3.0] (2026-07-14) — Codex CLI First-Class Harness Support

### Added

- **Codex CLI as a first-class harness** — Codex now gets the same automatic memory operation as Claude Code and OpenCode: session-start context injection (mental model, MAP, pinned nodes, WORKING), ambient auto-recall on each prompt, conversation capture for the scribe pipeline, and the full `graph_memory` tool surface. Promotes Codex out of the degraded-mode stub (`codex.ts` no-oped everything and `isDegradedMode("codex")` returned `true`).
  - Codex CLI added lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`) with an stdin/stdout contract compatible with the existing Claude Code hook handlers, so the same hook scripts power both harnesses.
  - New `bin/install-codex.sh` registers the MCP server in `~/.codex/config.toml`, merges lifecycle hooks into `~/.codex/hooks.json`, and handles Windows parity (node-direct hook commands when bash.exe can't run the `.sh` wrappers).
  - New `hooks/hooks-codex.json` source-of-truth for the Codex hook registration. Since Codex has no `SessionEnd` event, the `PreCompact` hook (matcher `manual|auto`) serves as the compaction-boundary flush trigger — it flushes the conversation buffer to a snapshot and queues scribe + observer right before context gets compressed. `SessionStart` already matches `compact` as a source, so context re-injection fires automatically after compaction.
  - New `templates/CODEX-memory-section.md` for AGENTS.md.
  - New `src/hooks/on-pre-compact.ts` + `bin/on-pre-compact.sh` — a synchronous, flush-only hook (no session-state cleanup) purpose-built for the Codex compaction boundary.
  - Codex added to the Skillforge harness adapters (`~/.codex/prompts`).

### Changed

- **`isDegradedMode()` now always returns `false`** — no harness runs in degraded mode. Codex's `ADAPTER_CONFIGS.supportsHooks` corrected to `true`; project doc filename corrected from `AGENT.md` to `AGENTS.md` (Codex's canonical name).

## [3.2.0] (2026-07-09) — Worker Fallback, Windows/Podman Support & Doc Corrections

### Added

- **User-selectable fallback worker** — the daemon now retries a failed or timed-out pipeline worker on a user-configured fallback harness/model (`fallbackProvider`/`fallbackModel`, set via `configure_runtime`), so a primary provider hitting a usage limit no longer drops the job. Fallback triggers on any worker failure, since usage-limit stalls surface as silent timeouts rather than usage-limit text. `/memory-switch-harness`, `/memory-onboard`, and the onboarder agent now prompt for both primary and fallback provider + model.
- **Native Windows (Git Bash) support** — the installer now uses an unprivileged directory junction (`mklink /J`) for the plugin link and content-synced copies for slash commands (plain `ln -s` silently degrades to copies / frozen snapshots without admin rights), and registers **node-direct** hook and MCP commands by resolving node's absolute path — bare `bash.exe` spawned by a non-Git-Bash process has no Git `usr/bin` on PATH and couldn't even run `dirname`, so the `.sh` wrappers failed before reaching node. Adds `session-end-launcher.ts`, a pure-Node equivalent of the detached session-end consolidation. Verified on Windows 11 (Git Bash + Podman 5.6.1).
- **Podman container-engine fallback** — `runtime-env.sh` detects `docker` or `podman` on PATH and, for Podman, emits a `docker()` forwarding function so every `docker-*.sh` script runs unmodified; `docker-bootstrap.sh` / `docker-start.sh` auto-start the Podman machine (it doesn't self-start like Docker Desktop); and `getRuntimeStatus()` resolves the same engine and reports it as `docker.state.engine`, so onboarding no longer claims no container runtime exists when only Podman is installed.

### Fixed

- **Notion batching regression** — restored `groupIntoBatches()` and the `notionSync.maxBatchSize` default (30), both dropped as collateral in an earlier Docker commit; fixes two stale tests.
- **README missing `/skill-install`** — added to the plugin command table (fixes the release-surface test).
- **Duplicate hook re-registration on Windows reinstall** — re-registration now replaces this plugin's stale entries for the same event/matcher instead of appending duplicates.
- **Corrupted Windows paths** — `fs.realpathSync` backslash paths are normalized to forward slashes before hitting a shell, and `docker-healthcheck.sh` doubles the container-path leading slash so MSYS doesn't rewrite it to a Windows path.
- **CRLF line endings breaking shell scripts** — added `.gitattributes` normalizing text files to LF (Windows checkouts had drifted to CRLF, showing 27 perpetually-"modified" `bin/*.sh` files); `.bat`/`.ps1` keep CRLF.
- **Over-broad gitignore** — anchored the `graph/` and `graph-memory/` ignore patterns to the repo root so they match only the local data directories, not source under `graph-memory-plugin/src/graph-memory/` (which had silently ignored new source files there).

### Changed

- **Graph budget raised** — `maxNodesBeforePrune` 300 → 3000 and `maxMapTokens` 12000 → 16000, so the graph holds far more nodes before pruning.
- **Docs corrected: observer & compressor are active** — README, SPEC, CLAUDE.md, and pipeline-audit-notes claimed these stages were "rolled back / not active" and gated behind a `GRAPH_MEMORY_V3` flag that does not exist in code. They actually run by default, ungated; only dreamer-v3 / dreamer-models remains unwired.
- **Plugin manifest version synced** — `.claude-plugin/plugin.json` was stale at 3.0.0 and now tracks `package.json`.

## [3.1.0] (2026-06-25) — Version Label Cleanup

### Fixed

- **Extension mental model injection was dead** — both `extensions/graph-memory.ts` (pi) and `extensions/graph-memory-opencode.ts` imported `hasV3Data`/`buildV3Context` from `session-start-context.js`, but those exports were renamed to `hasMentalModelData`/`buildSessionStartContext` during the earlier naming cleanup. The broken imports silently resolved to `undefined`, so mental model injection never fired in either extension. Fixed to use correct export names.

### Changed

- **All version labels removed** — v2/v3/v4 labels removed from source code, extensions, tests, and docs. File names and function names now describe function, not version history.
- **Whisper fallback removed from extensions** — extensions no longer read `mind/whisper.txt` as a fallback. Model.json is the single mental model source.
- **`buildV2Injection` → `buildFallbackInjection`** — renamed across all adapters.
- **`GRAPH_MEMORY_V3` env var removed** — was referenced in docs/tests but never read by source code.
- **`tests/v3-pipeline.check.mjs` → `tests/pipeline.check.mjs`** — test names and module paths updated.
- **`scripts/migrate-v2-to-v3.ts` → `scripts/migrate-mental-model.ts`** — renamed.

## [3.0.1] (2026-05-29) — Lifecycle Audit Hardening

### Daemon Crash Resilience (P0 fixes)

The daemon main loop had no catch block — any tick-level error permanently killed the daemon. Three compounding bugs made this likely:

1. **Tick housekeeping wrapped in try/catch** — `scavengeStaleBuffers()`, `cleanupOrphanSnapshots()`, `reconcileProjectWorkingBacklog()`, and all other tick functions now run inside a try/catch so a single file I/O error doesn't terminate the daemon.
2. **Per-file I/O guarded** — `scavengeStaleBuffers()` and `cleanupOrphanSnapshots()` wrapped each file iteration in try/catch (TOCTOU race: file deleted between `readdirSync` and subsequent `statSync`/`readFileSync`).
3. **Outer daemon catch added** — safety net catch block added to the daemon loop so fatal errors log and clean up instead of crashing silently.

### Ambient Recall Deduplication

`STOPWORDS`, pattern arrays (`EXPLICIT_MEMORY_PATTERNS`, `CONTINUITY_PATTERNS`, `PREFERENCE_PATTERNS`, `REPO_OPERATING_CONTEXT_PATTERNS`), `pathCategory()`, `categoryGateWeight()`, `countMatches()`, and the full `ambientRecall()` function extracted from three files into `src/graph-memory/scoring.ts`:

- `src/hooks/on-user-message.ts` — ~175 lines removed, imports from shared module
- `extensions/graph-memory.ts` (pi) — ~110 lines removed, thin `doAmbientRecall()` wrapper
- `extensions/graph-memory-opencode.ts` — ~80 lines removed, preserves `detectCurrentProject()` and `_updateLastAccessed` post-processing

### v2/v3 Merge Completion

- Observer `upsert_node` redirected from `CONFIG.paths.v3Graph` to `CONFIG.paths.nodes`
- Diverged `graph/` directory archived to `archive/v3-graph-backup/`
- Whisper injected as prefix before v2 context at session start (not gated by `hasV3Data()`)
- `GRAPH_MEMORY_V3=1` added to Docker environment

### Pipeline Hardening

- **Worker timeouts increased** — scribe 5→10m, auditor 12→20m, librarian 20→25m, dreamer 8→15m
- **Pipeline log rotation** — 30-day default, cleans `.log` and `.meta.json` files
- **Session pruning** — 14-day max age on session directories
- **WORKING.md regeneration** — runs after every scribe completion
- **`processJob()` default case** — unknown job types now throw instead of silently marking as done
- **Scribe payload validation** — required fields (`snapshotPath`, `sessionId`) checked before processing
- **`toWorkerPath()` null guard** — handles undefined input without crashing

### Type Safety Fixes

- **`truncate()` type guard** — handles non-string frontmatter gists that caused `text.replace is not a function`
- **`extractFirstParagraph()` type guard** — handles non-string content
- **Index entry gist** — uses `truncate()` instead of raw `.slice()` with cast, preventing crashes on non-string gists

### Dashboard

- Removed dead `ActivityPanel.tsx` (332 lines, never imported)
- CORS origin configurable via `MEMORY_DASHBOARD_CORS_ORIGIN` env var (default: `localhost:5173`)

### Notion Sync

- Webhook secret externalized to `${NOTION_WEBHOOK_SECRET}` env var in config
- Docker passthrough configured in `docker-start.sh`
- Webhook server starts when Notion sync is enabled (no longer requires secret to be set)
- Port 3100 exposed in Docker
- `skipInbound` configurable in config.yml (default: false)

### Dead Code Removed

- `src/graph-memory/pipeline/spawn.ts`
- `src/graph-memory/pipeline/observer.ts` (shell, logic in `observer-tools.ts`)
- `src/graph-memory/pipeline/compressor.ts` (shell, logic in `compressor-tools.ts`)

### Configuration

- `plugin.json` updated to v3.0.0 with all 7 commands and 9 agents registered
- `install.sh` symlinks all 12 commands
- `.gitignore` updated: `.DS_Store`, `graph-memory/`, `.env` patterns

### Edges Parsing Hardening

- **`Array.isArray` guard on `edges`/`anti_edges`** — auditor crashed when a node had non-array `edges` (single YAML object missing target). Replaced all `parsed.data.edges || []` with `Array.isArray` check across preflight, observer-tools, graph-ops, graph-index, mechanical-apply, and librarian. Same for `anti_edges`.
- **Daemon steward isolation** — try/catch around each steward so one failing steward doesn't block others.
- **execNtn env var injection** — injects `NOTION_API_TOKEN` into Docker container ntn calls, fixing keychain priority issue.

---

## 3.0.0 (2026-05-15) — Notion Sync Pipeline + Dashboard Enhancements

### Notion Sync Pipeline (new)

Two-way sync between graph-memory and a Notion workspace. Disk is agent-readable source of truth; Notion is a human-readable presentation layer ("Company Database of My Mind").

**Outbound sync:**
- Knowledge nodes grouped into wiki pages by category (patterns, architecture, preferences, archive, etc.)
- Decisions and briefs become database rows in dedicated databases
- Each project gets its own Notion page with project-specific content
- Chunked sync: 100 items per batch, sorted by confidence (highest first), daemon auto-enqueues next batch
- State file (`.notion-sync-state.json`) tracks page IDs, content hashes, and sync timestamps
- Diff-based: only changed items are synced

**Inbound sync:**
- Detects human edits in Notion pages and database rows
- Creates observations and deltas (never direct node mutations)
- Preserves the agent as the authority for graph structure

**Three-way merge:**
- When both graph and Notion have changed, human intent wins
- Agent information is preserved as callouts in the merged content
- Merge conflicts logged for review

**Consolidation:**
- Merges batched wiki-group pages into single category pages
- Archives the source batched pages after merge
- Reduces workspace page count (e.g. 63→31 pages in production)

**Infrastructure:**
- `notion-cli.ts` — CLI adapter wrapping `ntn` for all Notion API calls
- `notion-sync.ts` — State I/O, diff building, sync plan types, plan execution
- `notion-inbound.ts` — Inbound edit detection and merge I/O
- `notion-setup.ts` — Workspace setup with schema-aware property configuration
- `daemon.ts` — Job dispatch (`notion_sync`, `notion_inbound`, `notion_merge`), daily trigger
- `job-schema.ts` — `NotionSyncJobPayload` with `batchIndex` for chunked sync
- MCP actions: `notion_setup`, `notion_sync`, `notion_consolidate`
- Slash commands for Claude Code and OpenCode: `/notion-setup`, `/notion-sync`, `/notion-consolidate`
- Agent instructions: `agents/memory-notion-sync.md`, `agents/memory-notion-inbound.md`, `agents/memory-notion-merge.md`
- Uses Notion API v2026-03-11 with data sources for property management
- Design spec: `docs/notion-sync-spec.md`
- 48 tests in `tests/notion-sync.check.mjs`

### Dashboard Enhancements

- **Skills viewer** — new Skills section on the landing page with a card grid showing all generated skills (name, score, project, source node, refresh count). Click any card to expand and read the full slash command markdown content.
- **Notion Sync pipeline step** — step 7 in the pipeline flow diagram with purple accent. Pipeline cutoffs show sync status (enabled/disabled, last sync time, page/row counts, in-flight state, next scheduled sync hour).
- **Skills content endpoint** — `GET /api/skills/:name/content` reads the actual command file from the project directory.
- **Dashboard resilience** — `readAllJobs` now handles unknown job types with dynamic fallback instead of crashing.

### Pipeline Resilience Fixes

- Observer `processObserverOutputs` failed on stale observation files from prior runs — files are now unlinked after error
- `appendSessionLog` threw ENOENT for project names with `/` — parent directories are now ensured
- `normalizeBullet` in working update threw `text.replace is not a function` on non-string values — now guarded
- Decay archival stalled by over-broad category protection — archive targets are no longer skipped
- `reconcileProjectWorkingBacklog()` re-processed scribe jobs with invalid project paths (`private/tmp`) — now skips projects starting with `private/`, `tmp/`, or `/`

---

## 2.4.0 (2026-05-14) — Mental Model Architecture + Pipeline Improvements

### Mental Model System (folded into v2 pipeline)

Replaced `PRIORS.md` + `SOMA.md` with a structured JSON mental model. The v2 pipeline (`scribe → auditor → librarian → dreamer`) remains the active pipeline, but session-start injection now reads from the mental model instead of the old two-file approach.

**Global model** (`mind/model.json`):
- Cognitive style, decision patterns, preferences, guardrails, emotional profile, relational notes
- Companion `mind/whisper.txt` — pre-generated ~300-token injection paragraph
- `mind/observations.jsonl` — append-only observation feed

**Project models** (`lenses/{project}/`):
- Per-project tech stack, conventions, procedures, guardrails, active work, open threads
- Per-project `whisper.txt` and `observations.jsonl`
- Archivable and restorable via lens manager

**Session logs** (`sessions/{project}.jsonl`):
- Per-session records of shipped work, decisions, blocked items, open threads, next-session hints
- Auto-compaction: full detail < 3 days, summary 3–7 days, decisions-only 7–30 days, pruned > 30 days

### Merged Session Start

Session-start now uses a tiered injection strategy:

1. **If `GRAPH_MEMORY_V3=1` and whisper data exists** — injects from compressed whispers (~1,100 tokens total: global whisper ~400, project whisper ~500, session logs ~200, guardrails ~150)
2. **Otherwise (default)** — injects from `mind/model.json` + MAP + WORKING + PINNED + DREAMS, replacing the old PRIORS/SOMA with the structured mental model

Both paths share the same underlying data (`mind/model.json`). The v3 whisper path is a further compression that can be enabled when ready.

### Pipeline Infrastructure — Observer & Compressor (active)

The observer and compressor stages run by default as part of the pipeline (there is no `GRAPH_MEMORY_V3` gate — they are enqueued unconditionally by the daemon and harness extensions). The v2 scribe → auditor → librarian → dreamer chain remains the proven core; observer/compressor augment it.

- **Observer** — single LLM pass producing observations, session logs, and node upserts. Active; enqueued on scribe/buffer thresholds.
- **Compressor** — folds observations into mental models, generates whisper paragraphs. Active; enqueued after observer runs.
- **Dreamer V3 / dreamer-models** — creative recombination against compressed models. Present in code but **not wired** as a runnable job; the active dreamer is the v2 project-chain dreamer.

Reliability of the LLM-backed stages depends on the configured worker harness. If a worker fails or times out (e.g. a provider usage limit), the daemon automatically retries the job on the configured fallback worker (`fallbackProvider`/`fallbackModel`).

### Pipeline Prompt Improvements

All four v2 pipeline agent prompts were rewritten:
- **Scribe**: Captures "true memory" (evolving opinions, frustrations, contradictions, half-formed ideas) not just hard facts. Added `mark_stale` delta type.
- **Auditor**: Added stale/contradictory node detection as highest priority. Added noise/bloat candidates section.
- **Librarian**: Prune-over-preserve philosophy. Handles stale nodes as second priority (after PRIORS compression). Rewrite-over-append approach.
- **Dreamer**: Unchanged (already good).

### Harness Adapter System

- `types.ts` — `HarnessAdapter` interface with `HarnessType`, `AdapterConfig`, `SessionStartResult`
- `claude-code.ts`, `opencode.ts`, `pi.ts`, `codex.ts` — harness-specific adapters
- `factory.ts` — adapter instantiation
- `shared.ts` — shared adapter logic

Each adapter declares capabilities (hooks, plugin events, MCP) and project doc filename.

### Project Document Bootstrapping

New `pipeline/bootstrap.ts` auto-generates project docs (CLAUDE.md / AGENT.md) from mental models:

- Reads global model, project model, observations, anti-patterns
- Generates structured sections (mental model, inject flow, project working)
- Preserves custom `<!-- custom start -->` / `<!-- custom end -->` sections
- Detects drift between current model state and existing doc content

### v3 Graph Index

New `pipeline/graph-index-v3.ts` replaces flat JSON array with Map-keyed structure:

- O(1) path lookups, category and project filtering
- Incremental add/remove without full rebuild
- Lazy load with mtime-based cache invalidation
- Anti-pattern queries for guardrail injection

### Key Files in WORKING Handoff

`project-working.ts` now extracts `keyFiles` from tool traces — files that were edited or created during a session. These appear in a new `## Files` section of per-project WORKING handoff, priming the next session with the most relevant file paths.

### YAML Frontmatter Repair

New `pipeline/yaml-repair.ts` handles real-world malformation patterns in node frontmatter:

- Unquoted colons in title/gist values
- Duplicated mapping keys
- Extra/missing trailing quotes on date values
- Bad indentation

### Dashboard Redesign

Complete dashboard overhaul (`memory-dashboard/`):

- **2-column layout** — main content + persistent activity rail with real-time SSE
- **Architecture view** — mental model inspector with global model, project models, whisper preview, inject flow diagram
- **Session replay** — per-session event timeline with tool traces and delta previews
- **Memory health** — 4-metric health grid (node count, avg confidence, coverage, staleness)
- **Dream actions** — accept/reject buttons for pending dream fragments
- **Node editing** — inline edit form for gist, content, confidence, tags
- **Pipeline status** — compact flow diagram showing v2 + v3 pipeline state
- New API endpoints: `/api/model`, `/api/startup-context`, `/api/project-working`, `/api/events` (SSE)
- New job types in dashboard: `observer`, `compressor`, `dreamer_v3`, `bootstrap_project_doc`

### Pipeline Improvements

- Pipeline concurrency raised from 1 to 4 (`daemonConcurrency: 4`)
- Stale worker reaping at 5 minutes (was implicit)
- Session cap at 5 with replace-over-append merge (was append-only)
- New job types: `observer`, `compressor`, `bootstrap_project_doc`, `dreamer_v3`

### Migration Script

New `scripts/migrate-v2-to-v3.ts` for migrating existing v2 graph data:

- Reads all active nodes, high-confidence ones feed into global and project models
- Generates whisper paragraphs from model content
- Builds v3 graph index from node files
- Supports dry-run (`npx tsx ...`) and apply (`--apply`) modes

### Other Changes

- **Impeccable skill** bundled (`.agents/skills/impeccable/`) with 30+ design reference docs and live browser tooling
- **Agent instructions** updated: scribe, auditor, librarian, dreamer v3, observer, compressor, working-updater
- **OpenCode extension** updated for v3 adapter support
- **Pi extension** updated for v3 adapter support
- `SPEC.md` and `AGENT.md` added for architecture documentation
- `skills-lock.json` for reproducible skill installations

---

## 2026-05-10 — Phase 5: Automation & Project Isolation

### Automatic decay on daemon tick
- `runDecay()` now runs on every daemon tick when no graph-level job (auditor/librarian/dreamer) is in progress
- If any nodes decay or archive, `regenerateCoreContextFiles()` fires automatically to keep MAP in sync
- First tick decayed 388 nodes and rebuilt MAP (166 entries from 771 nodes)

### Mechanical dream reinforcement
- `reinforceDreams()` in `tools.ts`: when a node is accessed via recall/search/read_node, any pending dream referencing that node gets +0.05 confidence and `reinforcement_sessions` incremented
- Called from `updateLastAccessed()` so all access paths trigger it
- New event type: `graph:dream_reinforced`

### Scribe default confidence raised to 0.6
- New nodes now start at 0.6 confidence (was 0.5)
- Updated in both `mechanical-apply.ts` and scribe prompt examples
- Reduces low-confidence noise creation

### Skillforge threshold lowered
- `scoreThreshold` lowered from 0.65 to 0.55
- More nodes should surface as skillforge candidates

### Project isolation cleanup
- Merged duplicate project names: `keel3/oliver` → `Keel3/keel3_oliver_demo`, `keel3/keel3_oliver_demo` (lowercase) → `Keel3/keel3_oliver_demo`, `ConnorCallahan01/cogni-code` → `agent_memory`
- Renamed working files for `ConnorCallahan01/cogni-code` → `agent_memory`
- Dashboard `deriveProjects()` now only shows projects with WORKING files — stale projects with only nodes no longer appear in the chip strip

### Roadmap rewrite
- Replaced the Phase 1–4 roadmap with a current-state document reflecting completed work, remaining issues (R1–R4), and Phase 5 implementation plan
- All 5 phases (1–5) now complete; deferred items documented separately

---

## 2026-05-08 — Phase 1–4: Token Budget, Quality, Dashboard

### Phase 1: Stop the bleeding
- Score-based PRIORS truncation in `graph-ops.ts` (generality, conciseness, specificity scoring)
- 15k total injection budget in `session-start.ts` (split: 4k global + 11k project)
- Pinned node budget enforcement (3k total, respects both pinned and session budgets)
- Orphan snapshot cleanup in daemon tick (>4hrs, no active job) — cleaned 193 on first run
- Token accounting in `/api/health` with per-layer counts, budgets, overBudget flag

### Phase 2: Quality over quantity
- `decay_rate: 0.05` on all new nodes (scribe template + all code paths)
- Auditor mechanically adds `decay_rate: 0.05` to nodes missing it; `decay.ts` falls back to 0.05
- Archive threshold 0.10 → 0.20 in config
- Dream promotion 0.5/3 sessions → 0.4/2 sessions
- Librarian PRIORS compression (Step 2): compresses verbose entries, demotes project-specific to nodes
- One-time data cleanup: PRIORS compressed 28,925 → 574 tokens, 43/58 stale pinned nodes unpinned

### Phase 3: Operational
- Project-aware MAP injection: `buildProjectMAP()` in session-start — top 8 project + 2 other per category
- Project detection never falls back to "global" — `deriveProjectName()` uses `parent/base` from cwd
- Access tracking on `search`, `listEdges`, and connected nodes from `recall`
- Health score: 8 factors (node coverage 15, staleness 15, orphans 10, MAP 10, PRIORS 15, pinned 15, low-confidence 10, budget 10 = 100)
- Pipeline stats (scribe/auditor/librarian/dreamer/skillforge job counts) in health endpoint

### Phase 4: Intelligence
- Cross-session dedup in `mechanical-apply.ts` — `findSimilarNode()` checks gist word overlap >50% within category
- Project-first dashboard with auto-select, per-project scoping, injection budget in top bar

### Dashboard
- Complete CSS rewrite with OKLCH light theme design system
- App.tsx: project-first nav (top bar switcher), 4 views, persistent activity rail
- BriefView, GraphExplorer, ContextView, SessionReplay implemented
- ActivityPanel: persistent 300px right rail with Pipeline, Skills, Jobs, Health, Dreams, Audit, Events
- Memory health: GET `/api/health` with 8-factor score, token accounting, pipeline stats
- Dreams: POST accept/reject endpoints + action buttons
- Node editing via PUT `/api/node/:path` + inline form
