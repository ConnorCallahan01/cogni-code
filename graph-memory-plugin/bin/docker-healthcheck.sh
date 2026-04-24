#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

docker exec "$GRAPH_MEMORY_DOCKER_CONTAINER" /usr/local/bin/graph-memory-healthcheck
