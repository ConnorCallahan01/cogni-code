# Cogni-Code Roadmap

## Current State (2026-07-16)

| System | Status |
|--------|--------|
| npm package | Published as [`cogni-code`](https://www.npmjs.com/package/cogni-code) v3.5.0 — `npm install -g cogni-code` |
| Harnesses | Four first-class: Claude Code, Codex CLI, OpenCode, pi — all with full hooks + MCP + injection |
| Worker providers | Five: codex, claude, opencode, pi (CLI subprocess), api (direct HTTP, no Docker) |
| Active pipeline | scribe → auditor → librarian → dreamer + observer → compressor (battle-tested) |
| Mental model | Fully operational — `mind/`, `lenses/`, `sessions/` |
| Notion sync | Operational — two-way, 5 stewards, chunked sync, inbound triage |
| Session injection | model.json → guardrails → MAP → PINNED → WORKING → DREAMS (~11k tokens / 15k budget) |
| Docs & landing | [cognicode.app](https://cognicode.app) — Astro + Starlight, branded landing, full docs, agent install guide |
| CI/CD | Auto-publish to npm via GitHub Actions (Trusted Publishing + provenance) |
| Container support | NanoClaw, sandboxes, CI runners — `api` worker routes through credential proxies for subscription access |

---

## Completed

### Foundation (v1–v3.0)

- **Phase 1 (Stop the Bleeding):** PRIORS truncation, 15k injection budget, pinned node enforcement, orphan cleanup, token accounting.
- **Phase 2 (Quality Over Quantity):** Decay rate defaults, backfill, archive threshold lowered, dream promotion threshold fixed.
- **Phase 3 (Operational):** 8-factor health score, auditor threshold, access tracking on all recall paths, project-aware MAP injection.
- **Phase 4 (Intelligence):** Project-aware MAP filtering, cross-session dedup, dreamer implicit reinforcement.
- **Phase 5 (Automation & Cleanup):** Decay on every tick, mechanical dream reinforcement, scribe confidence tuning, Skillforge threshold.
- **Pipeline merge:** Per-project scribe→auditor→librarian→dreamer, global observer→compressor, project-aware scheduling.
- **v2/v3 unification:** Single canonical node store (`nodes/`), version labels removed, unified architecture.

### Distribution (v3.1–v3.4)

- **v3.1.0 — Version label cleanup:** All v2/v3/v4 labels removed from source, extensions, tests, and docs. Dead extension injection fixed (renamed exports). `GRAPH_MEMORY_V3` phantom env var removed.
- **v3.2.0 — Worker fallback & platform expansion:** User-selectable fallback worker (retries on usage limits). Native Windows (Git Bash) support with unprivileged junctions and node-direct hook commands. Podman container-engine fallback. Graph budget raised (300→3000 nodes, 12k→16k MAP tokens). Observer/compressor docs corrected — always active, never gated.
- **v3.3.0 — Codex CLI first-class:** Full session-start injection, ambient auto-recall, conversation capture, compaction-boundary flush (`PreCompact` hook), `graph_memory` tool. No harness runs in degraded mode.
- **v3.4.0 — npm package (`cogni-code`):** CLI dispatcher (`install`, `hook`, `mcp`, `status`, `--version`). Auto-detects harnesses. Hook registrations use CLI commands (version-independent, updates propagate without reinstall). Claude Code symlink, Codex hook merge, OpenCode plugin install. `--docker` flag for daemon setup. Graph auto-initialization with pointer detection.
- **v3.4.1–v3.4.4 — CI & docs:** Auto-publish via Trusted Publishing (OIDC + provenance). Publish-before-tag ordering fix. Docs & landing site at cognicode.app (Astro + Starlight, Cloudflare Pages).

### Agent UX (v3.5)

- **v3.5.0 — Direct-API worker + agent UX:** Fifth worker provider (`api`) — calls Anthropic Messages API via `fetch`, no subprocess/Docker/CLI binary. Respects `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` for credential proxy routing (subscription-compatible with NanoClaw/OneCLI). Batch validation for `remember` (all missing fields at once). UNDICI warning suppressed. Tabbed install per harness on docs site. Agent install guide (`/for-agents/`) — flat executable runbook for AI agents given a URL.

---

## Token Budget Architecture

Session injection uses a **split budget** — global context + project context:

| Layer | Scope | Budget | Actual | Purpose |
|-------|-------|--------|--------|---------|
| model.json | Global | 1,500 | ~400 | Cognitive model |
| MAP | Per-project | 7,000 | ~5,000 | Project-filtered knowledge index |
| PINNED | Per-project | 3,000 | ~2,500 | Essential project procedures |
| WORKING | Per-project | 2,000 | ~1,100 | Recent activity |
| DREAMS | Global | 400 | ~555 | Speculative fragments |
| Guardrails | Global | 1,500 | ~150 | Safety boundaries |
| Session logs | Per-project | 1,000 | ~200 | Recent session activity |
| **Total** | | **15,000** | **~11,000** | Well under budget |

---

## What's Next

### Near-term

- **Company memory** — shared/team knowledge graph layer. Individual graphs work exactly as today, with one addition: decisions and patterns are shared across an organization with provenance and audience classification. Design spec in `docs/company-memory/DESIGN.md`.
- **Provider expansion** — OpenRouter, Ollama, and other providers as `api` worker backends or CLI harness options.
- **Pipeline observability** — per-job token cost tracking, worker success rates, daemon health metrics surfaced in dashboard.

### Under consideration

- **Incremental MAP regeneration** — full regen is ~1s at current scale; incremental would help at 1000+ node graphs.
- **Combine auditor + librarian** — clean separation works today; merge would reduce one LLM call per pipeline cycle.
- **Agent self-onboarding** — the `/for-agents/` page is a runbook; making the plugin emit its own install instructions (so an agent discovers them without a URL) is the natural extension.

---

## Deferred (Indefinitely)

| Item | Why deferred |
|------|--------------|
| Per-job token cost tracking | Requires worker-level token instrumentation |
| Incremental MAP regeneration | Full regen is fast enough at current scale |
| Combine auditor + librarian | Clean separation works; merge saves one call but adds complexity |
| PRIORS entry age counter | Compression already handles staleness |

---

## Harness & Provider Matrix

| Harness | Session injection | Ambient recall | Conversation capture | Compaction flush | MCP tool |
|---------|:-:|:-:|:-:|:-:|:-:|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ |
| Codex CLI | ✅ | ✅ | ✅ | ✅ (PreCompact) | ✅ |
| OpenCode | ✅ | ✅ | ✅ | ✅ | ✅ (native plugin) |
| pi | ✅ | ✅ | ✅ | ✅ | ✅ (extension) |

| Worker | Execution | Docker required | Subscription | Use case |
|--------|-----------|:-:|:-:|----------|
| codex | CLI subprocess | Yes | ChatGPT | Desktops with Codex |
| claude | CLI subprocess | Yes | Claude Max | Desktops with Claude Code |
| opencode | CLI subprocess | Yes | Provider keys | Desktops with OpenCode |
| pi | CLI subprocess | Yes | Provider keys | Desktops with pi |
| api | In-process `fetch` | No | Via proxy or API key | Containers, sandboxes, CI |
