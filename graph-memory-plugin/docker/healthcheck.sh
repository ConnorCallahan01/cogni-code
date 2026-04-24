#!/bin/bash
set -euo pipefail

GRAPH_ROOT="${GRAPH_MEMORY_ROOT:-/graph-memory}"

test -d "$GRAPH_ROOT"
test -w "$GRAPH_ROOT"
test -d "$GRAPH_ROOT/.jobs"
test -f "$GRAPH_ROOT/.runtime-config.json"
command -v codex >/dev/null 2>&1

if [ -f "$GRAPH_ROOT/.jobs/daemon-state.json" ]; then
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data.running === false) process.exit(1);
  " "$GRAPH_ROOT/.jobs/daemon-state.json"
fi
