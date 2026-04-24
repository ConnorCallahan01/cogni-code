#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

docker inspect "$GRAPH_MEMORY_DOCKER_CONTAINER" --format '{{json .State}}' 2>/dev/null || echo '{"Status":"missing"}'
