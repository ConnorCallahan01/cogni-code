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
    echo "Codex auth is not ready inside the container."
    echo "Give the container its own login with one of:"
    echo "  $DIR/bin/docker-codex-login.sh"
    echo "  OPENAI_API_KEY=... $DIR/bin/docker-codex-login-api-key.sh"
    echo
    echo "Don't import a host ChatGPT login: the host and container would share one"
    echo "rotating refresh token, and the first side to refresh signs the other out."
    exit 1
    ;;
esac

echo "Harness '$HARNESS' auth is not ready inside the container."
exit 1
