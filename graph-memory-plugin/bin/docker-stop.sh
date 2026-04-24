#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

docker stop "$GRAPH_MEMORY_DOCKER_CONTAINER" >/dev/null 2>&1 || true
docker rm "$GRAPH_MEMORY_DOCKER_CONTAINER" >/dev/null 2>&1 || true
