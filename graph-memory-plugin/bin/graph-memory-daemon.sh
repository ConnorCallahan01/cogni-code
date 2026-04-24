#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"
export GRAPH_MEMORY_DAEMON=1
exec node "$DIR/dist/graph-memory/pipeline/daemon.js" "$@"
