import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const installerUrl = pathToFileURL(
  path.join(pluginDir, "dist/graph-memory/install/claude-code.js")
).href;

const PLUGIN_KEY = "graph-memory@cogni-code";

// Runs installClaudeCode in a subprocess with HOME pointed at a temp dir and
// a PATH that cannot resolve the `claude` CLI, exercising the direct
// config-file fallback without ever touching the real ~/.claude.
function runInstaller(tempHome) {
  const claudeDir = path.join(tempHome, ".claude");
  const stdout = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { installClaudeCode } = await import(${JSON.stringify(installerUrl)});
        const messages = installClaudeCode(${JSON.stringify(claudeDir)});
        process.stdout.write(JSON.stringify(messages));
      `,
    ],
    {
      cwd: pluginDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        PATH: "/usr/bin:/bin",
      },
    }
  );
  return JSON.parse(stdout);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

test("fallback install registers marketplace, plugin, and enablement", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-claude-install-"));
  const claudeDir = path.join(tempHome, ".claude");

  const messages = runInstaller(tempHome);
  assert.ok(
    messages.some((m) => m.includes("Registered plugin graph-memory@cogni-code")),
    `expected registration message, got: ${JSON.stringify(messages)}`
  );

  const marketplaces = readJson(path.join(claudeDir, "plugins", "known_marketplaces.json"));
  assert.equal(marketplaces["cogni-code"].source.source, "directory");
  assert.ok(fs.existsSync(path.join(marketplaces["cogni-code"].source.path, ".claude-plugin", "marketplace.json")));

  const registry = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"));
  const entry = registry.plugins[PLUGIN_KEY][0];
  assert.equal(entry.scope, "user");
  assert.equal(entry.version, readJson(path.join(pluginDir, ".claude-plugin", "plugin.json")).version);
  assert.ok(fs.existsSync(path.join(entry.installPath, "hooks", "hooks.json")));

  const settings = readJson(path.join(claudeDir, "settings.json"));
  assert.equal(settings.enabledPlugins[PLUGIN_KEY], true);
  assert.equal(settings.extraKnownMarketplaces["cogni-code"].source.source, "directory");

  // Re-running must be idempotent and preserve installedAt.
  runInstaller(tempHome);
  const registryAfter = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"));
  assert.equal(registryAfter.plugins[PLUGIN_KEY][0].installedAt, entry.installedAt);
});

test("install cleans up artifacts from pre-plugin-system installers", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-claude-legacy-"));
  const claudeDir = path.join(tempHome, ".claude");
  const pluginsDir = path.join(claudeDir, "plugins");
  const commandsDir = path.join(claudeDir, "commands");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(path.join(commandsDir, "graph-memory"), { recursive: true });

  // Legacy symlink + @local registry entry + enablement
  fs.symlinkSync(pluginDir, path.join(pluginsDir, "graph-memory"));
  fs.writeFileSync(
    path.join(pluginsDir, "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "graph-memory@local": [{ scope: "user", installPath: pluginDir, version: "local" }],
        "other@marketplace": [{ scope: "user", installPath: "/elsewhere", version: "1.0.0" }],
      },
    })
  );

  // Legacy direct hook registration + a user-owned hook that must survive
  fs.writeFileSync(
    path.join(claudeDir, "settings.json"),
    JSON.stringify({
      enabledPlugins: { "graph-memory@local": true },
      hooks: {
        SessionStart: [
          { matcher: "startup", hooks: [{ type: "command", command: `${pluginDir}/bin/session-start.sh` }] },
          { matcher: "startup", hooks: [{ type: "command", command: "echo user-owned" }] },
        ],
        PreToolUse: [
          {
            matcher: "mcp__graph-memory__graph_memory",
            hooks: [{ type: "command", command: 'echo \'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\'' }],
          },
        ],
      },
    })
  );

  // Legacy top-level MCP entry in ~/.claude.json
  fs.writeFileSync(
    path.join(tempHome, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        "graph-memory": { type: "stdio", command: `${pluginDir}/bin/mcp-server.sh`, args: [], env: {} },
        "other-server": { type: "stdio", command: "other", args: [], env: {} },
      },
    })
  );

  // Legacy command links: one of ours, one user-owned file with custom content
  fs.symlinkSync(
    path.join(pluginDir, "commands", "memory-status.md"),
    path.join(commandsDir, "memory-status.md")
  );
  fs.copyFileSync(
    path.join(pluginDir, "commands", "memory-search.md"),
    path.join(commandsDir, "graph-memory", "memory-search.md")
  );
  fs.writeFileSync(path.join(commandsDir, "memory-onboard.md"), "user-customized content\n");

  runInstaller(tempHome);

  assert.ok(!fs.existsSync(path.join(pluginsDir, "graph-memory")), "legacy symlink should be removed");

  const registry = readJson(path.join(pluginsDir, "installed_plugins.json"));
  assert.equal(registry.plugins["graph-memory@local"], undefined);
  assert.ok(registry.plugins["other@marketplace"], "unrelated plugins must survive");
  assert.ok(registry.plugins[PLUGIN_KEY], "new registration should exist");

  const settings = readJson(path.join(claudeDir, "settings.json"));
  assert.equal(settings.enabledPlugins["graph-memory@local"], undefined);
  assert.equal(settings.enabledPlugins[PLUGIN_KEY], true);
  const sessionStart = settings.hooks.SessionStart;
  assert.equal(sessionStart.length, 1, "our legacy hook should be removed");
  assert.equal(sessionStart[0].hooks[0].command, "echo user-owned");
  assert.equal(settings.hooks.PreToolUse, undefined, "self-allow rule should be removed");

  const claudeJson = readJson(path.join(tempHome, ".claude.json"));
  assert.equal(claudeJson.mcpServers["graph-memory"], undefined);
  assert.ok(claudeJson.mcpServers["other-server"], "unrelated MCP servers must survive");

  assert.ok(!fs.existsSync(path.join(commandsDir, "memory-status.md")), "our command symlink should be removed");
  assert.ok(
    !fs.existsSync(path.join(commandsDir, "graph-memory")),
    "namespaced command dir should be removed once empty"
  );
  assert.ok(fs.existsSync(path.join(commandsDir, "memory-onboard.md")), "user-customized file must survive");
});
