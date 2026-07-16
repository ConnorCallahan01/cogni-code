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

<details>
<summary>Permission denied (EACCES)?</summary>

Locked-down containers may block global installs. Use a local install instead:

```bash
npm install cogni-code && npx cogni-code install
```

</details>

## With the background pipeline

### Docker mode (recommended for desktops)

```bash
npm install -g cogni-code
cogni-code install --docker
```

Sets up the Docker daemon that runs the scribe/librarian/dreamer pipeline automatically. Requires Docker Desktop or Podman. Auto-detects the worker provider (codex, claude, opencode, or api) or specify with `--worker codex`.

### API mode (no Docker required)

If your environment has no Docker or Podman — a NanoClaw container, a sandbox, a CI runner — the `api` worker runs the full pipeline via direct HTTP calls. No CLI agent binary, no subprocess:

```bash
cogni-code install --docker --worker api
```

The `api` worker respects the standard Anthropic env-var surface, so it routes through whatever credential infrastructure your agent already uses:

| Env var | Auth method | Use case |
|---|---|---|
| `ANTHROPIC_API_KEY` | `x-api-key` header | Direct API key (bills per-token) |
| `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` | `Authorization: Bearer` | **Credential proxy** (e.g. OneCLI Agent Vault in NanoClaw) — routes to your **subscription**, no API billing |

It auto-activates when credentials are present and no CLI harness is detected. You can also start the daemon directly without Docker:

```bash
node "$(npm root -g)/cogni-code/dist/graph-memory/pipeline/daemon.js"
```

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
