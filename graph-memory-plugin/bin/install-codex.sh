#!/usr/bin/env bash
set -euo pipefail

# graph-memory — Codex CLI plugin installer
# Usage: ./bin/install-codex.sh
#
# Codex CLI now supports lifecycle hooks (SessionStart, UserPromptSubmit,
# PreToolUse, PostToolUse, Stop) with an stdin/stdout contract compatible
# with the existing Claude Code hook handlers. This installer:
#   1. Registers the graph_memory MCP server in ~/.codex/config.toml
#   2. Merges lifecycle hooks into ~/.codex/hooks.json
#   3. Prints guidance for the AGENTS.md memory section + hook trust

PLUGIN_NAME="graph-memory"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
CONFIG_TOML="$CODEX_DIR/config.toml"
HOOKS_JSON="$CODEX_DIR/hooks.json"

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

echo "Installing $PLUGIN_NAME for Codex CLI from $PLUGIN_DIR"

# 1. Install dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install)
fi

# 2. Build so dist/ is up to date
echo "Building..."
(cd "$PLUGIN_DIR" && npm run build)

mkdir -p "$CODEX_DIR"

# Resolve node binary for Windows (bare bash.exe has no coreutils on PATH).
NODE_BIN=""
if [ "$IS_WINDOWS" = "1" ]; then
  RESOLVED_NODE="$(command -v node || true)"
  if [ -z "$RESOLVED_NODE" ]; then
    echo "Error: node not found on PATH. Install Node 18+ and re-run from Git Bash." >&2
    exit 1
  fi
  NODE_BIN="$(cygpath -m "$RESOLVED_NODE")"
fi

MCP_SCRIPT="$PLUGIN_DIR/dist/graph-memory/mcp-server.js"
MCP_WRAPPER="$PLUGIN_DIR/bin/mcp-server.sh"

# 3. Register MCP server in ~/.codex/config.toml under [mcp_servers.graph-memory]
#    Codex uses TOML config; we manage the [mcp_servers.graph-memory] table by
#    removing any existing block and appending a fresh one.
if [ ! -f "$CONFIG_TOML" ]; then
  echo "# Codex CLI configuration" > "$CONFIG_TOML"
  echo "Created $CONFIG_TOML"
fi

if [ "$IS_WINDOWS" = "1" ]; then
  MCP_COMMAND="$NODE_BIN"
  MCP_ARGS_JSON="[\"$MCP_SCRIPT\"]"
else
  MCP_COMMAND="bash"
  MCP_ARGS_JSON="[\"$MCP_WRAPPER\"]"
fi

CONFIG_TOML="$CONFIG_TOML" MCP_COMMAND="$MCP_COMMAND" MCP_ARGS_JSON="$MCP_ARGS_JSON" \
node -e "
  const fs = require('fs');
  const configPath = process.env.CONFIG_TOML;
  const command = process.env.MCP_COMMAND;
  const args = JSON.parse(process.env.MCP_ARGS_JSON);

  let toml = fs.readFileSync(configPath, 'utf8');

  // Remove any existing [mcp_servers.graph-memory] table block.
  // A TOML table runs from its header until the next [table] header or EOF.
  const lines = toml.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[mcp_servers\.graph-memory\]/.test(trimmed)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^\[/.test(trimmed)) {
        skipping = false;
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }
  let body = out.join('\n').replace(/\s+$/, '');

  // Append the fresh table.
  const block = [
    '',
    '',
    '[mcp_servers.graph-memory]',
    'command = ' + JSON.stringify(command),
    'args = ' + JSON.stringify(args),
    ''
  ].join('\n');

  body += block;
  fs.writeFileSync(configPath, body + '\n');
  console.log('Registered MCP server in ' + configPath);
"

# 4. Merge lifecycle hooks into ~/.codex/hooks.json
#    Reads hooks/hooks-codex.json (source of truth), substitutes the plugin
#    directory, and merges into the user hooks file (deduping old entries).
HOOKS_TEMPLATE="$PLUGIN_DIR/hooks/hooks-codex.json"

HOOKS_JSON="$HOOKS_JSON" HOOKS_TEMPLATE="$HOOKS_TEMPLATE" PLUGIN_DIR="$PLUGIN_DIR" NODE_BIN="$NODE_BIN" IS_WINDOWS="$IS_WINDOWS" \
node -e "
  const fs = require('fs');
  const hooksPath = process.env.HOOKS_JSON;
  const templatePath = process.env.HOOKS_TEMPLATE;
  const pluginDir = process.env.PLUGIN_DIR;
  const nodeBin = process.env.NODE_BIN;
  const isWindows = process.env.IS_WINDOWS === '1';

  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

  // Windows: bare bash.exe can't run the .sh wrappers, so invoke node on the
  // compiled .js directly (matching the Claude Code Windows strategy).
  function resolveCommand(cmd) {
    if (cmd.includes('\$GRAPH_MEMORY_PLUGIN_DIR')) {
      if (isWindows && nodeBin) {
        const script = cmd
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/session-start.sh', pluginDir + '/dist/hooks/session-start.js')
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/on-user-message.sh', pluginDir + '/dist/hooks/on-user-message.js')
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/on-post-tool-use.sh', pluginDir + '/dist/hooks/on-post-tool-use.js')
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/on-pre-compact.sh', pluginDir + '/dist/hooks/on-pre-compact.js')
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/on-assistant-response.sh', pluginDir + '/dist/hooks/on-assistant-response.js')
          .replace('\$GRAPH_MEMORY_PLUGIN_DIR/bin/session-end.sh', pluginDir + '/dist/hooks/session-end.js');
        return nodeBin + ' ' + script;
      }
      return cmd.split('\$GRAPH_MEMORY_PLUGIN_DIR').join(pluginDir);
    }
    return cmd;
  }

  // Build the incoming hooks with resolved paths.
  const incoming = { hooks: {} };
  for (const [event, matcherGroups] of Object.entries(template.hooks)) {
    incoming.hooks[event] = matcherGroups.map(group => ({
      ...(group.matcher ? { matcher: group.matcher } : {}),
      hooks: (group.hooks || []).map(h => ({
        type: h.type,
        command: resolveCommand(h.command),
        ...(h.timeout ? { timeout: h.timeout } : {}),
        ...(h.statusMessage ? { statusMessage: h.statusMessage } : {}),
      })),
    }));
  }

  // Read existing hooks (if any).
  let existing = { hooks: {} };
  try {
    const raw = fs.readFileSync(hooksPath, 'utf8');
    existing = JSON.parse(raw);
    if (!existing.hooks) existing.hooks = {};
  } catch {
    // No existing hooks file — start fresh.
  }

  // Merge: for each incoming event, remove old graph-memory entries then append.
  for (const [event, matcherGroups] of Object.entries(incoming.hooks)) {
    if (!existing.hooks[event]) existing.hooks[event] = [];
    const incomingKeys = matcherGroups.map(g => JSON.stringify(g));
    existing.hooks[event] = existing.hooks[event].filter(group => {
      // Dedup exact matches (handles the echo auto-allow hook).
      if (incomingKeys.includes(JSON.stringify(group))) return false;
      // Remove plugin-dir-based entries (handles reinstall with a new path).
      const hooks = group.hooks || [];
      return !hooks.some(h => typeof h.command === 'string' && h.command.includes(pluginDir));
    });
    existing.hooks[event].push(...matcherGroups);
  }

  // Strip the _comment key if it leaked through.
  delete existing._comment;

  fs.writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + '\n');
  console.log('Merged lifecycle hooks into ' + hooksPath);
"

echo ""
echo "Done! Restart Codex CLI to load graph-memory."
echo ""
echo "IMPORTANT — trust the hooks:"
echo "  Codex requires you to review and trust hooks before they run."
echo "  Open Codex and run /hooks to review and trust the graph-memory hooks."
echo ""
echo "The plugin provides:"
echo "  - graph_memory tool: access the persistent knowledge graph"
echo "  - Session-start injection: mental model, MAP, pinned nodes, WORKING"
echo "  - Ambient auto-recall: relevant memories surfaced on each prompt"
echo "  - Conversation capture: feeds the background scribe pipeline"
echo ""
echo "Optional: add memory instructions to your AGENTS.md by copying"
echo "  templates/CODEX-memory-section.md into your project."
if [ "$IS_WINDOWS" = "1" ]; then
  echo ""
  echo "Windows note: hook commands invoke node directly on compiled .js files"
  echo "  because bare bash.exe can't run the .sh wrappers."
fi
