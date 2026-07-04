#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_CLAUDE_HOME="$HOME/.claude"
HOST_CREDENTIALS="$HOST_CLAUDE_HOME/.credentials.json"
CONTAINER_CLAUDE_HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.claude"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI is not installed on the host."
  exit 1
fi

if [ ! -f "$HOST_CREDENTIALS" ]; then
  echo "Host Claude credentials not found at $HOST_CREDENTIALS. Run 'claude auth login' on the host first."
  exit 1
fi

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'mkdir -p "$HOME/.claude" && chmod 700 "$HOME" "$HOME/.claude"'

docker cp "$HOST_CREDENTIALS" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER:$CONTAINER_CLAUDE_HOME/.credentials.json"

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'chmod 700 "$HOME" "$HOME/.claude" && chmod 600 "$HOME/.claude/.credentials.json"'

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'claude auth status'
