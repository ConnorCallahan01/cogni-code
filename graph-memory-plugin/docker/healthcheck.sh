#!/bin/bash
set -euo pipefail

GRAPH_ROOT="${GRAPH_MEMORY_ROOT:-/graph-memory}"

test -d "$GRAPH_ROOT"
test -w "$GRAPH_ROOT"
test -d "$GRAPH_ROOT/.jobs"
test -f "$GRAPH_ROOT/.runtime-config.json"

# The configured worker harnesses (primary and fallback) must be installed.
for provider in $(node -e "
  const docker = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).docker || {};
  console.log([docker.workerProvider || 'codex', docker.fallbackProvider].filter(Boolean).join(' '));
" "$GRAPH_ROOT/.runtime-config.json"); do
  case "$provider" in
    codex|opencode|pi|claude) command -v "$provider" >/dev/null 2>&1 ;;
  esac
done

if [ -f "$GRAPH_ROOT/.jobs/daemon-state.json" ]; then
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data.running === false) process.exit(1);
  " "$GRAPH_ROOT/.jobs/daemon-state.json"
fi
