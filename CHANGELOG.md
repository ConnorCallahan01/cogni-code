# Changelog

All notable changes to graph-memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **OpenCode plugin extension** (`extensions/graph-memory-opencode.ts`) — native OpenCode plugin that registers the `graph_memory` tool, injects context files (MAP, PRIORS, SOMA, WORKING, DREAMS) at session start, performs ambient auto-recall on user messages, and captures conversation for the scribe pipeline.
- **`bin/install-opencode.sh`** — installer that symlinks the OpenCode extension and slash commands into `~/.config/opencode/` and registers the MCP server (disabled by default) in `opencode.json`.
- **`opencode-commands/`** — 7 slash commands for OpenCode (`memory-onboard`, `memory-status`, `memory-search`, `memory-morning-kickoff`, `memory-connect-inputs`, `memory-input-refresh`, `memory-wire-project`).
- **`templates/OPENCODE-memory-section.md`** — memory instruction template for wiring into OpenCode project `AGENTS.md` files.
- **`.dockerignore`** — excludes unnecessary files from Docker builds.
- Updated documentation across `CLAUDE.md`, `README.md`, `graph-memory-plugin/README.md`, and `docs/setup-from-clone.md` to reflect OpenCode as a supported harness alongside Claude Code and pi.

### Changed

- **`package.json`** description updated to mention OpenCode; `opencode-commands/` added to files array.

### Fixed

- Patched npm audit vulnerabilities.

## [2.0.0] — 2026-05-04

### Added

- **pi coding agent harness** — pi is now a supported worker provider alongside codex and claude. The Docker image includes `@mariozechner/pi-coding-agent`, and new scripts (`docker-pi-auth-status.sh`, `docker-pi-import-host-auth.sh`) handle pi auth import into the container. Pipeline spawner and worker-runner both support pi as a dispatch target.
- **`/memory-switch-harness` command and skill** — switch the background pipeline worker between codex, claude, and pi without manual config editing.
- **Memory skills suite** — standalone skills for `/memory-onboard`, `/memory-search`, `/memory-status`, `/memory-morning-kickoff`, `/memory-wire-project`, `/memory-connect-inputs`, `/memory-input-refresh`, and `/recall`.
- **`CHANGELOG.md`** — this file, tracking notable changes in keepachangelog format.

### Changed

- **Project-aware WORKING.md** — pipeline context regeneration now respects the active project scope, preventing non-project-aware runs from overwriting WORKING.md with global-only content.
- **CLAUDE.md** wired with idempotent graph-memory section via `/memory-wire-project`.
- **Agent instructions** updated for memory-onboarder and memory-working-updater.
- **Auth check** generalized to detect the active worker provider and validate the correct harness auth.
- **MCP server** and runtime config now support `workerProvider` as a first-class field.

### Fixed

- **WORKING.md project drift** — non-project-aware `regenerateAllContextFiles()` could overwrite project-scoped WORKING.md from other sessions. Generator now respects the configured project.
