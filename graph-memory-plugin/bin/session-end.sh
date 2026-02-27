#!/bin/bash
# Session end hook — runs consolidation in a detached process so it
# survives Claude Code exiting (Ctrl+C / SIGINT).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"

# Capture stdin first (hook JSON), then run detached
STDIN_DATA=$(cat)
LOG="$DIR/.consolidation.log"
echo "$STDIN_DATA" | nohup node "$DIR/dist/hooks/session-end.js" >> "$LOG" 2>&1 &
