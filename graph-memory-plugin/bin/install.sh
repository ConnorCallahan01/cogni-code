#!/usr/bin/env bash
set -euo pipefail

# graph-memory — Claude Code plugin installer
# Usage: ./bin/install.sh

PLUGIN_NAME="graph-memory"
CLAUDE_DIR="$HOME/.claude"
PLUGINS_DIR="$CLAUDE_DIR/plugins"
REGISTRY_FILE="$PLUGINS_DIR/installed_plugins.json"

# Resolve plugin directory (where this script lives, minus /bin)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Installing $PLUGIN_NAME from $PLUGIN_DIR"

# 1. Install dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install)
fi

# 2. Build if dist missing
if [ ! -d "$PLUGIN_DIR/dist" ]; then
  echo "Building..."
  (cd "$PLUGIN_DIR" && npm run build)
fi

# 3. Create plugins directory if needed
mkdir -p "$PLUGINS_DIR"

# 4. Create symlink
SYMLINK="$PLUGINS_DIR/$PLUGIN_NAME"
if [ -L "$SYMLINK" ]; then
  EXISTING_TARGET="$(readlink "$SYMLINK")"
  if [ "$EXISTING_TARGET" = "$PLUGIN_DIR" ]; then
    echo "Symlink already exists and points to correct location."
  else
    echo "Updating symlink: $EXISTING_TARGET -> $PLUGIN_DIR"
    ln -sfn "$PLUGIN_DIR" "$SYMLINK"
  fi
elif [ -e "$SYMLINK" ]; then
  echo "Warning: $SYMLINK exists but is not a symlink. Skipping."
else
  ln -s "$PLUGIN_DIR" "$SYMLINK"
  echo "Created symlink: $SYMLINK -> $PLUGIN_DIR"
fi

# 5. Register in installed_plugins.json
if [ ! -f "$REGISTRY_FILE" ]; then
  echo '{"version":2,"plugins":{}}' > "$REGISTRY_FILE"
fi

# Check if already registered
if [ -f "$REGISTRY_FILE" ] && grep -qF "\"$PLUGIN_NAME@local\"" "$REGISTRY_FILE"; then
  echo "Already registered in installed_plugins.json"
else
  # Use node with env vars to safely merge into the JSON (avoids jq dependency)
  REGISTRY_FILE="$REGISTRY_FILE" PLUGIN_NAME="$PLUGIN_NAME" PLUGIN_DIR="$PLUGIN_DIR" \
  node -e "
    const fs = require('fs');
    const reg = JSON.parse(fs.readFileSync(process.env.REGISTRY_FILE, 'utf8'));
    reg.plugins[process.env.PLUGIN_NAME + '@local'] = [{
      scope: 'user',
      installPath: process.env.PLUGIN_DIR,
      version: 'local',
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }];
    fs.writeFileSync(process.env.REGISTRY_FILE, JSON.stringify(reg, null, 2) + '\n');
  "
  echo "Registered in installed_plugins.json"
fi

# 6. Register MCP server in ~/.claude.json (user-wide scope)
#    Claude Code reads MCP server configs from ~/.claude.json, not from plugin.json.
#    The user-wide scope (keyed by $HOME) makes it available in all projects.
CLAUDE_JSON="$HOME/.claude.json"
MCP_COMMAND="$PLUGIN_DIR/bin/mcp-server.sh"

if [ ! -f "$CLAUDE_JSON" ]; then
  echo "Warning: $CLAUDE_JSON not found. Is Claude Code installed?"
  echo "You can manually add the MCP server later via /mcp in Claude Code."
else
  CLAUDE_JSON="$CLAUDE_JSON" MCP_COMMAND="$MCP_COMMAND" PLUGIN_NAME="$PLUGIN_NAME" \
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync(process.env.CLAUDE_JSON, 'utf8'));
    const home = process.env.HOME;
    const name = process.env.PLUGIN_NAME;
    const command = process.env.MCP_COMMAND;

    // Ensure projects and home scope exist
    if (!config.projects) config.projects = {};
    if (!config.projects[home]) config.projects[home] = {};
    if (!config.projects[home].mcpServers) config.projects[home].mcpServers = {};

    if (config.projects[home].mcpServers[name]) {
      // Update command path if it changed
      const existing = config.projects[home].mcpServers[name];
      if (existing.command !== command) {
        existing.command = command;
        fs.writeFileSync(process.env.CLAUDE_JSON, JSON.stringify(config, null, 2) + '\n');
        console.log('Updated MCP server command in ~/.claude.json');
      } else {
        console.log('MCP server already registered in ~/.claude.json');
      }
    } else {
      config.projects[home].mcpServers[name] = {
        type: 'stdio',
        command: command,
        args: [],
        env: {}
      };
      fs.writeFileSync(process.env.CLAUDE_JSON, JSON.stringify(config, null, 2) + '\n');
      console.log('Registered MCP server in ~/.claude.json (user-wide)');
    }
  "
fi

# 7. Register hooks in ~/.claude/settings.json
#    Hooks auto-load MAP/PRIORS at session start and run consolidation at session end.
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
SESSION_START="$PLUGIN_DIR/bin/session-start.sh"
SESSION_END="$PLUGIN_DIR/bin/session-end.sh"
ON_RESPONSE="$PLUGIN_DIR/bin/on-assistant-response.sh"
ON_USER_MSG="$PLUGIN_DIR/bin/on-user-message.sh"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

SETTINGS_FILE="$SETTINGS_FILE" SESSION_START="$SESSION_START" SESSION_END="$SESSION_END" ON_RESPONSE="$ON_RESPONSE" ON_USER_MSG="$ON_USER_MSG" \
node -e "
  const fs = require('fs');
  const settings = JSON.parse(fs.readFileSync(process.env.SETTINGS_FILE, 'utf8'));

  if (!settings.hooks) settings.hooks = {};

  const startCmd = process.env.SESSION_START;
  const endCmd = process.env.SESSION_END;
  const responseCmd = process.env.ON_RESPONSE;
  let changed = false;

  function ensureHook(event, matcher, command) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    const arr = settings.hooks[event];
    const exists = arr.some(entry =>
      entry.hooks && entry.hooks.some(h => h.command === command)
    );
    if (!exists) {
      arr.push({ matcher, hooks: [{ type: 'command', command }] });
      changed = true;
    }
  }

  const userMsgCmd = process.env.ON_USER_MSG;

  // SessionStart: load MAP and PRIORS into context
  ensureHook('SessionStart', 'startup', startCmd);

  // UserPromptSubmit: capture user messages to buffer
  ensureHook('UserPromptSubmit', '', userMsgCmd);

  // Stop: capture assistant responses and trigger scribe
  ensureHook('Stop', '', responseCmd);

  // SessionEnd: run consolidation pipeline (empty matcher = all exit reasons)
  ensureHook('SessionEnd', '', endCmd);

  if (changed) {
    fs.writeFileSync(process.env.SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
    console.log('Registered session hooks in ~/.claude/settings.json');
  } else {
    console.log('Hooks already registered in ~/.claude/settings.json');
  }
"

echo ""
echo "Done! Restart Claude Code or run /mcp to reconnect."
