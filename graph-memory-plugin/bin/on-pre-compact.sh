#!/bin/bash
# Pre-compact hook — fires before Codex compacts the context window.
# Flushes the conversation buffer to a snapshot and queues scribe + observer
# so the memory pipeline captures everything before context is compressed.
# Runs synchronously (no nohup) so the flush completes before compaction.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"
exec node "$DIR/dist/hooks/on-pre-compact.js"
