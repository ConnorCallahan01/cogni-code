---
title: Install
description: Install Cogni-Code globally via npm or from source.
---

## npm (recommended)

```bash
npm install -g cogni-code
cogni-code install
```

Auto-detects Claude Code, Codex CLI, and OpenCode. Initializes graph memory at `~/.graph-memory/` if needed. For a custom location:

```bash
cogni-code install --graph-root /path/to/memory
```

## With the background pipeline (Docker)

```bash
npm install -g cogni-code
cogni-code install --docker
```

Sets up the Docker daemon that runs the scribe/librarian/dreamer pipeline automatically. Requires Docker Desktop or Podman. Auto-detects the worker provider (codex, claude, or opencode) or specify with `--worker codex`.

Updates are automatic &mdash; `npm update -g cogni-code` updates all hooks instantly (they call the `cogni-code` CLI, not absolute file paths).

## From source (git clone)

```bash
git clone https://github.com/ConnorCallahan01/cogni-code.git
cd cogni-code/graph-memory-plugin
npm install && npm run build

./bin/install.sh           # Claude Code
./bin/install-codex.sh     # Codex CLI
./bin/install-opencode.sh  # OpenCode
```

## First run

Then start a session and run:

```text
/memory-onboard
```

The onboard wizard walks you through runtime mode and seeds your first memory nodes. If you installed via npm, the graph is already initialized &mdash; onboarding is optional.
