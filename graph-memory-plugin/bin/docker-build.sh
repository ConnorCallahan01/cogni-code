#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

docker build \
  -f "$DIR/docker/Dockerfile" \
  -t "$GRAPH_MEMORY_DOCKER_IMAGE" \
  "$DIR"
