import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { resolvePkgRoot } from "./detect.js";

const PLUGIN_NAME = "graph-memory";
const MARKETPLACE_NAME = "cogni-code";
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const LEGACY_PLUGIN_KEY = `${PLUGIN_NAME}@local`;

// Hook wrapper scripts this package has ever registered directly into
// ~/.claude/settings.json (pre-plugin-system installs). Used only to
// recognize our own legacy entries during cleanup.
const HOOK_SCRIPT_NAMES = [
  "session-start",
  "session-end",
  "session-end-launcher",
  "on-user-message",
  "on-assistant-response",
  "on-pre-tool-use",
  "on-post-tool-use",
];

// Claude Code's plugin system changed: plugins must belong to a registered
// marketplace and be enabled in settings.json, or they are silently ignored
// (no hooks, no MCP server — i.e. no memory capture at all). The reliable
// path is the `claude plugin` CLI, which owns the registration schema; when
// the CLI is unavailable we write the same records directly.
export function installClaudeCode(claudeDir: string): string[] {
  const messages: string[] = [];
  const pkgRoot = resolvePkgRoot();

  messages.push(...cleanupLegacyInstall(claudeDir, pkgRoot));

  const cli = registerWithClaudeCli(claudeDir, pkgRoot);
  messages.push(...cli.messages);
  if (!cli.ok) {
    messages.push(...registerDirect(claudeDir, pkgRoot));
  }
  return messages;
}

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function runClaude(args: string[], timeoutMs: number): { ok: boolean; output: string } {
  try {
    const r = spawnSync("claude", args, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      // Windows installs claude as a .cmd shim, which spawnSync only
      // resolves through a shell.
      shell: process.platform === "win32",
    });
    if (r.error || r.status !== 0) {
      return { ok: false, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() || String(r.error ?? `exit ${r.status}`) };
    }
    return { ok: true, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
  } catch (err: any) {
    return { ok: false, output: err.message };
  }
}

function registerWithClaudeCli(
  claudeDir: string,
  pkgRoot: string
): { ok: boolean; messages: string[] } {
  const messages: string[] = [];

  const probe = runClaude(["--version"], 30000);
  if (!probe.ok) {
    return { ok: false, messages: ["claude CLI not found on PATH — writing plugin registration directly."] };
  }

  // `marketplace add` is idempotent and repoints an existing entry when the
  // package path changed (e.g. after switching Node versions).
  const add = runClaude(["plugin", "marketplace", "add", pkgRoot], 240000);
  if (!add.ok) {
    return { ok: false, messages: [`claude plugin marketplace add failed: ${add.output}`] };
  }

  const install = runClaude(["plugin", "install", PLUGIN_KEY], 240000);
  if (!install.ok) {
    return { ok: false, messages: [`claude plugin install failed: ${install.output}`] };
  }

  // Install is a no-op when already present, so refresh the cached copy too.
  const update = runClaude(["plugin", "update", PLUGIN_KEY], 240000);
  if (!update.ok) {
    messages.push(`Warning: claude plugin update failed: ${update.output}`);
  }

  const registry = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"));
  if (!registry?.plugins?.[PLUGIN_KEY]) {
    return { ok: false, messages: [...messages, "Plugin missing from registry after CLI install — writing registration directly."] };
  }

  messages.push(`Registered plugin ${PLUGIN_KEY} via claude CLI.`);

  const settings = readJson(path.join(claudeDir, "settings.json"));
  if (settings?.enabledPlugins?.[PLUGIN_KEY] === false) {
    messages.push(`Warning: plugin is disabled in settings.json. Enable it with: claude plugin enable ${PLUGIN_KEY}`);
  }
  return { ok: true, messages };
}

// Mirrors the records `claude plugin marketplace add` + `claude plugin
// install` write, pointing installPath at the package itself instead of a
// cache snapshot (there is no CLI around to manage a cache).
function registerDirect(claudeDir: string, pkgRoot: string): string[] {
  const messages: string[] = [];
  const now = new Date().toISOString();
  const manifest = readJson(path.join(pkgRoot, ".claude-plugin", "plugin.json"));
  const version = typeof manifest?.version === "string" ? manifest.version : "0.0.0";

  const marketplacesPath = path.join(claudeDir, "plugins", "known_marketplaces.json");
  const marketplaces = readJson(marketplacesPath) || {};
  marketplaces[MARKETPLACE_NAME] = {
    source: { source: "directory", path: pkgRoot },
    installLocation: pkgRoot,
    lastUpdated: now,
  };
  writeJson(marketplacesPath, marketplaces);

  const registryPath = path.join(claudeDir, "plugins", "installed_plugins.json");
  const registry = readJson(registryPath) || { version: 2, plugins: {} };
  if (!registry.plugins) registry.plugins = {};
  const current = Array.isArray(registry.plugins[PLUGIN_KEY]) ? registry.plugins[PLUGIN_KEY][0] : null;
  registry.plugins[PLUGIN_KEY] = [
    {
      scope: "user",
      installPath: pkgRoot,
      version,
      installedAt: current?.installedAt || now,
      lastUpdated: now,
    },
  ];
  writeJson(registryPath, registry);

  const settingsPath = path.join(claudeDir, "settings.json");
  const settings = readJson(settingsPath) || {};
  if (typeof settings.extraKnownMarketplaces !== "object" || settings.extraKnownMarketplaces === null) {
    settings.extraKnownMarketplaces = {};
  }
  settings.extraKnownMarketplaces[MARKETPLACE_NAME] = {
    source: { source: "directory", path: pkgRoot },
  };
  if (typeof settings.enabledPlugins !== "object" || settings.enabledPlugins === null) {
    settings.enabledPlugins = {};
  }
  if (settings.enabledPlugins[PLUGIN_KEY] === false) {
    messages.push(`Plugin left disabled (settings.json has ${PLUGIN_KEY}: false). Enable it with: claude plugin enable ${PLUGIN_KEY}`);
  } else {
    settings.enabledPlugins[PLUGIN_KEY] = true;
  }
  writeJson(settingsPath, settings);

  messages.push(`Registered plugin ${PLUGIN_KEY} in Claude Code config files.`);
  return messages;
}

// Earlier installers left artifacts the current plugin system either ignores
// or double-registers against: a plugins/graph-memory symlink, a
// graph-memory@local registry key, hooks and an MCP server written straight
// into settings files, and slash-command symlinks that now duplicate the
// plugin's own commands. Remove everything that is recognizably ours.
function cleanupLegacyInstall(claudeDir: string, pkgRoot: string): string[] {
  const messages: string[] = [];

  // plugins/graph-memory symlink (junction on Windows)
  const legacyLink = path.join(claudeDir, "plugins", PLUGIN_NAME);
  try {
    fs.readlinkSync(legacyLink); // throws unless it is a link
    try {
      fs.unlinkSync(legacyLink);
    } catch {
      fs.rmdirSync(legacyLink);
    }
    messages.push("Removed legacy plugin symlink.");
  } catch {
    /* not present or not a link */
  }

  // graph-memory@local registry entry
  const registryPath = path.join(claudeDir, "plugins", "installed_plugins.json");
  const registry = readJson(registryPath);
  if (registry?.plugins?.[LEGACY_PLUGIN_KEY]) {
    delete registry.plugins[LEGACY_PLUGIN_KEY];
    writeJson(registryPath, registry);
    messages.push(`Removed legacy ${LEGACY_PLUGIN_KEY} registry entry.`);
  }

  // settings.json: legacy enablement + directly-registered hooks
  const settingsPath = path.join(claudeDir, "settings.json");
  const settings = readJson(settingsPath);
  if (settings) {
    let changed = false;
    if (settings.enabledPlugins?.[LEGACY_PLUGIN_KEY] !== undefined) {
      delete settings.enabledPlugins[LEGACY_PLUGIN_KEY];
      if (Object.keys(settings.enabledPlugins).length === 0) delete settings.enabledPlugins;
      changed = true;
    }
    if (removeLegacyHooks(settings)) {
      changed = true;
      messages.push("Removed legacy hook entries from settings.json (now provided by the plugin).");
    }
    if (changed) writeJson(settingsPath, settings);
  }

  // ~/.claude.json: top-level MCP server entry older install.sh versions wrote
  const claudeJsonPath = path.join(os.homedir(), ".claude.json");
  const claudeJson = readJson(claudeJsonPath);
  if (claudeJson?.mcpServers?.[PLUGIN_NAME]) {
    delete claudeJson.mcpServers[PLUGIN_NAME];
    writeJson(claudeJsonPath, claudeJson);
    messages.push("Removed legacy user-scope MCP entry from ~/.claude.json (now provided by the plugin).");
  }

  messages.push(...cleanupLegacyCommandLinks(claudeDir, pkgRoot));
  return messages;
}

function isLegacyHookCommand(command: string): boolean {
  if (!command.includes("cogni-code") && !command.includes(PLUGIN_NAME)) return false;
  return HOOK_SCRIPT_NAMES.some(
    (name) => command.includes(`/bin/${name}.sh`) || command.includes(`/dist/hooks/${name}.js`)
  );
}

// The self-allow rule carries our identity in its matcher, not its command
// (the command is a bare echo of a permission decision).
function isLegacyHookEntry(entry: any): boolean {
  if (!Array.isArray(entry?.hooks)) return false;
  const commands: string[] = entry.hooks
    .map((h: any) => h?.command)
    .filter((c: any): c is string => typeof c === "string");
  if (commands.some(isLegacyHookCommand)) return true;
  return (
    typeof entry.matcher === "string" &&
    entry.matcher.includes(`mcp__${PLUGIN_NAME}__`) &&
    commands.some((c) => c.includes("permissionDecision"))
  );
}

function removeLegacyHooks(settings: Record<string, any>): boolean {
  if (typeof settings.hooks !== "object" || settings.hooks === null) return false;
  let changed = false;
  for (const [eventName, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry: any) => !isLegacyHookEntry(entry));
    if (kept.length !== entries.length) {
      changed = true;
      if (kept.length === 0) delete settings.hooks[eventName];
      else settings.hooks[eventName] = kept;
    }
  }
  if (changed && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return changed;
}

// Pre-plugin installs linked (Unix) or copied (Windows) every command file
// into ~/.claude/commands/ and ~/.claude/commands/graph-memory/. The plugin
// now serves the same commands, so those become duplicates in the command
// list. Only files that are verifiably ours are removed: symlinks into a
// cogni-code/graph-memory package, or copies whose content matches the
// shipped file byte-for-byte.
function cleanupLegacyCommandLinks(claudeDir: string, pkgRoot: string): string[] {
  const sourceDir = path.join(pkgRoot, "commands");
  if (!fs.existsSync(sourceDir)) return [];

  const commandsDir = path.join(claudeDir, "commands");
  const namespacedDir = path.join(commandsDir, PLUGIN_NAME);
  let removed = 0;

  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".md")) continue;
    for (const target of [path.join(commandsDir, file), path.join(namespacedDir, file)]) {
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(target);
          if (linkTarget.includes("cogni-code") || linkTarget.includes(PLUGIN_NAME)) {
            fs.unlinkSync(target);
            removed++;
          }
        } else if (stat.isFile()) {
          const source = fs.readFileSync(path.join(sourceDir, file));
          if (source.equals(fs.readFileSync(target))) {
            fs.unlinkSync(target);
            removed++;
          }
        }
      } catch {
        /* target absent or unreadable — leave it */
      }
    }
  }

  try {
    if (fs.existsSync(namespacedDir) && fs.readdirSync(namespacedDir).length === 0) {
      fs.rmdirSync(namespacedDir);
    }
  } catch {
    /* best effort */
  }

  return removed > 0
    ? [`Removed ${removed} legacy command link(s) (commands now come from the plugin).`]
    : [];
}
