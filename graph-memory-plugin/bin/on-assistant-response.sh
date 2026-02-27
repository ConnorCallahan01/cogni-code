#!/bin/bash
# Captures each assistant response and logs the exchange to the buffer.
# Fires on the Stop hook — receives JSON on stdin with last_assistant_message
# and transcript_path. Extracts the last user message from the transcript.

DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"

exec node "$DIR/dist/hooks/on-assistant-response.js"
