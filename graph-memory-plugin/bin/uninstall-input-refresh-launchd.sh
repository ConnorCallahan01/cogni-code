#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.graphmemory.input-refresh.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "Removed $PLIST_PATH"
else
  echo "No input refresh launchd job installed."
fi
