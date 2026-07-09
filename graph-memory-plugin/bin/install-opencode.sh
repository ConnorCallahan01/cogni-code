#!/usr/bin/env bash
set -euo pipefail

# graph-memory — OpenCode plugin installer
# Usage: ./bin/install-opencode.sh
#
# Builds the graph-memory plugin and symlinks the extension + commands
# into ~/.config/opencode/ so OpenCode discovers them at startup.

PLUGIN_NAME="graph-memory"
OPENCODE_DIR="$HOME/.config/opencode"
PLUGINS_DIR="$OPENCODE_DIR/plugins"
COMMANDS_DIR="$OPENCODE_DIR/commands"

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

echo "Installing $PLUGIN_NAME for OpenCode from $PLUGIN_DIR"

# 1. Install dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install)
fi

# 2. Build so dist/ is up to date
echo "Building..."
(cd "$PLUGIN_DIR" && npm run build)

# 3. Create directories if needed
mkdir -p "$PLUGINS_DIR" "$COMMANDS_DIR"

# 4. Copy the OpenCode extension into the plugins directory.
#    We copy (not symlink) because Bun/Node resolve bare-specifier imports
#    like "zod" from the real path of the file.  A symlink pointing into
#    another repo would fail to resolve dependencies installed in
#    ~/.config/opencode/node_modules/.
TARGET="$PLUGINS_DIR/$PLUGIN_NAME.ts"
EXTENSION_SOURCE="$PLUGIN_DIR/extensions/graph-memory-opencode.ts"

if [ -L "$TARGET" ]; then
  echo "Replacing existing symlink with copy..."
  rm "$TARGET"
fi

if [ -e "$TARGET" ]; then
  if cmp -s "$TARGET" "$EXTENSION_SOURCE"; then
    echo "Plugin file is already up to date."
  else
    cp "$EXTENSION_SOURCE" "$TARGET"
    echo "Updated plugin file: $TARGET"
  fi
else
  cp "$EXTENSION_SOURCE" "$TARGET"
  echo "Installed plugin file: $TARGET"
fi

# 5. Link commands into ~/.config/opencode/commands/
link_command() {
  local source_file="$1"
  local target_file="$2"

  if [ "$IS_WINDOWS" = "1" ]; then
    # Real symlinks need admin/Developer Mode on Windows; copy and keep in
    # sync by content hash instead.
    if [ -e "$target_file" ] && [ ! -L "$target_file" ]; then
      if cmp -s "$source_file" "$target_file"; then
        return
      fi
      cp "$source_file" "$target_file"
      echo "Updated command: $target_file"
      return
    fi
    cp "$source_file" "$target_file"
    echo "Installed command: $target_file"
    return
  fi

  if [ -L "$target_file" ]; then
    local existing_target
    existing_target="$(readlink "$target_file")"
    if [ "$existing_target" = "$source_file" ]; then
      return
    fi
    ln -sfn "$source_file" "$target_file"
    echo "Updated command symlink: $target_file"
    return
  fi

  if [ -e "$target_file" ]; then
    echo "Warning: $target_file exists and is not a symlink. Skipping."
    return
  fi

  ln -s "$source_file" "$target_file"
  echo "Installed command: $target_file"
}

for command_file in "$PLUGIN_DIR"/opencode-commands/*.md; do
  [ -f "$command_file" ] || continue
  command_name="$(basename "$command_file")"
  link_command "$command_file" "$COMMANDS_DIR/$command_name"
done

# 6. Register MCP server (disabled by default) in opencode.json
#    The plugin registers the tool directly, but the MCP server is
#    useful for other MCP clients or advanced usage.
OPENCODE_CONFIG="$OPENCODE_DIR/opencode.json"
MCP_COMMAND="$PLUGIN_DIR/bin/mcp-server.sh"
MCP_SCRIPT="$PLUGIN_DIR/dist/graph-memory/mcp-server.js"

# mcp-server.sh has a bash shebang, and bash.exe spawned bare by OpenCode
# (not via the Git Bash launcher) has no coreutils on PATH to even run it —
# it fails on the script's first line before reaching node. Bypass bash
# entirely on Windows: invoke node on the compiled script directly.
MCP_RUNNER_COMMAND="bash"
MCP_RUNNER_SCRIPT="$MCP_COMMAND"
if [ "$IS_WINDOWS" = "1" ]; then
  RESOLVED_NODE="$(command -v node || true)"
  if [ -z "$RESOLVED_NODE" ]; then
    echo "Error: node not found on PATH. Install Node 18+ and re-run from Git Bash." >&2
    exit 1
  fi
  MCP_RUNNER_COMMAND="$(cygpath -m "$RESOLVED_NODE")"
  MCP_RUNNER_SCRIPT="$MCP_SCRIPT"
fi

if [ ! -f "$OPENCODE_CONFIG" ]; then
  echo '{}' > "$OPENCODE_CONFIG"
  echo "Created $OPENCODE_CONFIG"
fi

OPENCODE_CONFIG="$OPENCODE_CONFIG" MCP_RUNNER_COMMAND="$MCP_RUNNER_COMMAND" MCP_RUNNER_SCRIPT="$MCP_RUNNER_SCRIPT" PLUGIN_NAME="$PLUGIN_NAME" \
node -e "
  const fs = require('fs');
  const configPath = process.env.OPENCODE_CONFIG;
  const name = process.env.PLUGIN_NAME;
  const runnerCommand = process.env.MCP_RUNNER_COMMAND;
  const runnerScript = process.env.MCP_RUNNER_SCRIPT;
  let changed = false;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    config = {};
  }

  if (!config.mcp) config.mcp = {};

  const desired = {
    type: 'local',
    command: [runnerCommand, runnerScript],
    enabled: true
  };

  const existing = config.mcp[name];
  if (JSON.stringify(existing) !== JSON.stringify(desired)) {
    config.mcp[name] = desired;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('Registered MCP server in opencode.json (disabled by default — the plugin handles tool registration).');
    console.log('Enable it in your config if you want MCP-only access alongside the plugin.');
  } else {
    console.log('MCP server already registered in opencode.json');
  }
"

echo ""
echo "Done! Restart OpenCode to load the graph-memory plugin."
echo ""
echo "The plugin provides:"
echo "  - graph_memory tool: access the persistent knowledge graph"
echo "  - Automatic context injection: MAP, PRIORS, SOMA, WORKING, DREAMS loaded at session start"
echo "  - Ambient auto-recall: relevant memories surfaced automatically"
echo "  - Conversation capture: feeds the background scribe pipeline"
echo ""
echo "Commands installed:"
echo "  /memory-onboard, /memory-status, /memory-search, /memory-morning-kickoff,"
echo "  /memory-wire-project, /memory-connect-inputs, /memory-input-refresh,"
echo "  /memory-switch-harness"
echo ""
echo "Optional: add memory instructions to your AGENTS.md by copying"
echo "  templates/OPENCODE-memory-section.md into your project."
