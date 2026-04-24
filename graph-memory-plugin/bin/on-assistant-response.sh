#!/bin/bash
# Captures each assistant response and logs the canonical final assistant turn
# to the buffer. Also syncs visible intermediary assistant text from Claude's
# local session transcript when available.

DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"

exec node "$DIR/dist/hooks/on-assistant-response.js"
