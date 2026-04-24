#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY must be set in the host environment before running this script."
  exit 1
fi

printf '%s' "$OPENAI_API_KEY" | docker exec -i \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'codex login --with-api-key'
