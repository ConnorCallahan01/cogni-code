#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HARNESS="${GRAPH_MEMORY_WORKER_PROVIDER:-codex}"

case "$HARNESS" in
  pi)
    if "$DIR/bin/docker-pi-auth-status.sh"; then
      exit 0
    fi
    ;;
  opencode)
    if "$DIR/bin/docker-opencode-auth-status.sh"; then
      exit 0
    fi
    ;;
  claude)
    echo "claude harness: no automated auth check yet. Ensure ANTHROPIC_API_KEY or OAuth is available."
    exit 0
    ;;
  codex|*)
    if "$DIR/bin/docker-codex-auth-status.sh"; then
      exit 0
    fi
    echo
    echo "If Codex is already authenticated on the host, you can import it with:"
    echo "  $DIR/bin/docker-codex-import-host-auth.sh"
    echo
    echo "Codex auth is not ready inside the container."
    echo "Run one of:"
    echo "  $DIR/bin/docker-codex-import-host-auth.sh"
    echo "  $DIR/bin/docker-codex-login.sh"
    echo "  OPENAI_API_KEY=... $DIR/bin/docker-codex-login-api-key.sh"
    exit 1
    ;;
esac

echo "Harness '$HARNESS' auth is not ready inside the container."
exit 1
