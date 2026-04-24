#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
HOST_AUTH_JSON="$HOST_CODEX_HOME/auth.json"
HOST_CONFIG_TOML="$HOST_CODEX_HOME/config.toml"
CONTAINER_CODEX_HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.codex"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI is not installed on the host."
  exit 1
fi

if ! codex login status >/dev/null 2>&1; then
  echo "Host Codex login is not ready. Run 'codex login' on the host first."
  exit 1
fi

if [ ! -f "$HOST_AUTH_JSON" ]; then
  echo "Host Codex auth file not found at $HOST_AUTH_JSON"
  exit 1
fi

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'mkdir -p "$HOME/.codex" && chmod 700 "$HOME" "$HOME/.codex"'

docker cp "$HOST_AUTH_JSON" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER:$CONTAINER_CODEX_HOME/auth.json"

if [ -f "$HOST_CONFIG_TOML" ]; then
  docker cp "$HOST_CONFIG_TOML" \
    "$GRAPH_MEMORY_DOCKER_CONTAINER:$CONTAINER_CODEX_HOME/config.toml"
fi

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'chmod 700 "$HOME" "$HOME/.codex" && chmod 600 "$HOME/.codex/auth.json" && if [ -f "$HOME/.codex/config.toml" ]; then chmod 600 "$HOME/.codex/config.toml"; fi'

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'codex login status'
