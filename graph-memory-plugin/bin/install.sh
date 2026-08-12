#!/usr/bin/env bash
set -euo pipefail

# graph-memory — Claude Code plugin installer (repo-clone convenience wrapper)
# Usage: ./bin/install.sh
#
# Builds the plugin, then delegates to the same installer the npm CLI uses
# (`cogni-code install --claude`), which registers the package as a proper
# Claude Code plugin marketplace + plugin and cleans up artifacts left by
# older installer versions.

# Resolve plugin directory (where this script lives, minus /bin)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v node &>/dev/null; then
  echo "Error: node not found on PATH. Install Node 18+ first." >&2
  exit 1
fi

echo "Installing graph-memory from $PLUGIN_DIR"

# 1. Install dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install)
fi

# 2. Build on every install so dist cannot drift from src after local updates
#    (prebuilt installs ship dist/ without src/ — nothing to rebuild there)
if [ -d "$PLUGIN_DIR/src" ]; then
  echo "Building..."
  (cd "$PLUGIN_DIR" && npm run build)
elif [ ! -d "$PLUGIN_DIR/dist" ]; then
  echo "Error: no dist/ found and no src/ to build from in $PLUGIN_DIR" >&2
  exit 1
fi

# 3. Register with Claude Code via the unified installer
node "$PLUGIN_DIR/dist/graph-memory/cli.js" install --claude
