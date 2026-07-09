#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

# Doubled leading slash: escapes Git Bash's MSYS path-conversion, which
# would otherwise rewrite this container-internal path to a Windows path
# before it reaches docker.exe/podman.exe. Linux collapses `//` back to `/`.
docker exec "$GRAPH_MEMORY_DOCKER_CONTAINER" //usr/local/bin/graph-memory-healthcheck
