#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.graphmemory.input-refresh.plist"
LOG_DIR="$HOME/.graph-memory/.logs"
HOUR="${1:-6}"
MINUTE="${2:-50}"
TIMEZONE="${3:-${TZ:-$(systemsetup -gettimezone 2>/dev/null | awk -F': ' 'NF>1{print $2}')}}"

if [ -z "${TIMEZONE:-}" ]; then
  TIMEZONE="UTC"
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.graphmemory.input-refresh</string>
    <key>ProgramArguments</key>
    <array>
      <string>$DIR/bin/external-inputs.sh</string>
      <string>refresh</string>
      <string>$TIMEZONE</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>$HOUR</integer>
      <key>Minute</key>
      <integer>$MINUTE</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/input-refresh.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/input-refresh.stderr.log</string>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/com.graphmemory.input-refresh"

echo "Installed launchd job at $PLIST_PATH"
echo "Runs external input refresh daily at ${HOUR}:${MINUTE} (${TIMEZONE})"
