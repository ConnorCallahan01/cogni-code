#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

docker exec -it \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'codex login --device-auth'
