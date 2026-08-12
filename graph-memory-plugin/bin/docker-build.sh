#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

# The image consumes prebuilt dist/ — compile on the host when running from a source checkout.
if [ ! -d "$DIR/dist" ]; then
  if [ -d "$DIR/src" ]; then
    echo "dist/ missing — building on host..."
    (cd "$DIR" && npm install && npm run build)
  else
    echo "ERROR: $DIR/dist not found and no src/ to build from." >&2
    exit 1
  fi
fi

docker build \
  -f "$DIR/docker/Dockerfile" \
  -t "$GRAPH_MEMORY_DOCKER_IMAGE" \
  "$DIR"
