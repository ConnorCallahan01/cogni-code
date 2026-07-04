#!/usr/bin/env bash
set -euo pipefail

# graph-memory - Codex CLI MCP + hook registration
# Usage: ./bin/install-codex.sh
#
# Codex supports hooks and MCP. This installer registers the graph_memory
# MCP server plus user-level Codex hooks for session-start injection and
# automatic conversation/tool capture.

PLUGIN_NAME="graph-memory"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CODEX_CONFIG="$CODEX_HOME/config.toml"
CODEX_HOOKS="$CODEX_HOME/hooks.json"

IS_WINDOWS=0
if [ "${OS:-}" = "Windows_NT" ]; then
  IS_WINDOWS=1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$IS_WINDOWS" = "1" ]; then
  if ! command -v cygpath &>/dev/null; then
    echo "Error: this looks like Windows but 'cygpath' isn't on PATH. Run this from Git Bash." >&2
    exit 1
  fi
  PLUGIN_DIR="$(cygpath -m "$PLUGIN_DIR")"
fi

echo "Installing $PLUGIN_NAME MCP server for Codex from $PLUGIN_DIR"

# 1. Install dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install)
fi

# 2. Build on every install so dist cannot drift from src after local updates
echo "Building..."
(cd "$PLUGIN_DIR" && npm run build)

# 3. Resolve the command Codex will spawn for the MCP server.
#    mcp-server.sh has a bash shebang, and bash.exe spawned bare by Codex
#    (not via the Git Bash launcher) has no coreutils on PATH to even run
#    it - it fails on the script's first line before reaching node. Bypass
#    bash entirely on Windows: invoke node on the compiled script directly.
#    Unix executes the shebang natively via the OS.
MCP_COMMAND="$PLUGIN_DIR/bin/mcp-server.sh"
MCP_SCRIPT="$PLUGIN_DIR/dist/graph-memory/mcp-server.js"
MCP_RUNNER="$MCP_COMMAND"
MCP_RUNNER_ARGS=()
if [ "$IS_WINDOWS" = "1" ]; then
  RESOLVED_NODE="$(command -v node || true)"
  if [ -z "$RESOLVED_NODE" ]; then
    echo "Error: node not found on PATH. Install Node 18+ and re-run from Git Bash." >&2
    exit 1
  fi
  MCP_RUNNER="$(cygpath -m "$RESOLVED_NODE")"
  MCP_RUNNER_ARGS=("$MCP_SCRIPT")
fi

# 4. Upsert [mcp_servers.graph-memory] in config.toml
mkdir -p "$CODEX_HOME"
if [ ! -f "$CODEX_CONFIG" ]; then
  : > "$CODEX_CONFIG"
  echo "Created $CODEX_CONFIG"
fi

node "$PLUGIN_DIR/dist/graph-memory/register-codex-mcp.js" "$CODEX_CONFIG" "$PLUGIN_NAME" "$MCP_RUNNER" "${MCP_RUNNER_ARGS[@]}"

# 5. Upsert graph-memory lifecycle hooks in hooks.json
SESSION_START_COMMAND="\"$PLUGIN_DIR/bin/session-start.sh\""
USER_PROMPT_COMMAND="\"$PLUGIN_DIR/bin/on-user-message.sh\""
ASSISTANT_STOP_COMMAND="\"$PLUGIN_DIR/bin/on-assistant-response.sh\""
PRE_TOOL_USE_COMMAND="\"$PLUGIN_DIR/bin/on-pre-tool-use.sh\""
POST_TOOL_USE_COMMAND="\"$PLUGIN_DIR/bin/on-post-tool-use.sh\""

SESSION_START_WINDOWS=""
USER_PROMPT_WINDOWS=""
ASSISTANT_STOP_WINDOWS=""
PRE_TOOL_USE_WINDOWS=""
POST_TOOL_USE_WINDOWS=""

if [ "$IS_WINDOWS" = "1" ]; then
  SESSION_START_WINDOWS="\"$MCP_RUNNER\" \"$(cygpath -m "$PLUGIN_DIR/dist/hooks/session-start.js")\""
  USER_PROMPT_WINDOWS="\"$MCP_RUNNER\" \"$(cygpath -m "$PLUGIN_DIR/dist/hooks/on-user-message.js")\""
  ASSISTANT_STOP_WINDOWS="\"$MCP_RUNNER\" \"$(cygpath -m "$PLUGIN_DIR/dist/hooks/on-assistant-response.js")\""
  PRE_TOOL_USE_WINDOWS="\"$MCP_RUNNER\" \"$(cygpath -m "$PLUGIN_DIR/dist/hooks/on-pre-tool-use.js")\""
  POST_TOOL_USE_WINDOWS="\"$MCP_RUNNER\" \"$(cygpath -m "$PLUGIN_DIR/dist/hooks/on-post-tool-use.js")\""
fi

node "$PLUGIN_DIR/dist/graph-memory/register-codex-hooks.js" \
  "$CODEX_HOOKS" \
  "$SESSION_START_COMMAND" \
  "$USER_PROMPT_COMMAND" \
  "$ASSISTANT_STOP_COMMAND" \
  "$PRE_TOOL_USE_COMMAND" \
  "$POST_TOOL_USE_COMMAND" \
  "$SESSION_START_WINDOWS" \
  "$USER_PROMPT_WINDOWS" \
  "$ASSISTANT_STOP_WINDOWS" \
  "$PRE_TOOL_USE_WINDOWS" \
  "$POST_TOOL_USE_WINDOWS"

echo ""
echo "Done! Restart Codex (or start a new session) to load the graph-memory MCP server and hooks."
echo ""
echo "Open /hooks in Codex if it asks you to review and trust the new graph-memory hooks."
