import fs from "fs";
import path from "path";
import { resolvePkgRoot } from "./detect.js";

const PLUGIN_NAME = "graph-memory";

export function installClaudeCode(claudeDir: string): string[] {
  const messages: string[] = [];
  const pkgRoot = resolvePkgRoot();
  const pluginsDir = path.join(claudeDir, "plugins");
  const symlink = path.join(pluginsDir, PLUGIN_NAME);

  fs.mkdirSync(pluginsDir, { recursive: true });

  if (fs.existsSync(symlink) && fs.lstatSync(symlink).isSymbolicLink()) {
    const existing = fs.readlinkSync(symlink);
    if (path.resolve(path.dirname(symlink), existing) === pkgRoot) {
      messages.push("Plugin symlink already exists and points to correct location.");
    } else {
      fs.unlinkSync(symlink);
      fs.symlinkSync(pkgRoot, symlink);
      messages.push(`Updated symlink: ${symlink} -> ${pkgRoot}`);
    }
  } else if (!fs.existsSync(symlink)) {
    fs.symlinkSync(pkgRoot, symlink);
    messages.push(`Created symlink: ${symlink} -> ${pkgRoot}`);
  } else {
    messages.push(`Warning: ${symlink} exists but is not a symlink. Skipping.`);
  }

  messages.push(...registerInRegistry(claudeDir, pkgRoot));
  messages.push(...linkCommands(claudeDir, pkgRoot));

  return messages;
}

function registerInRegistry(claudeDir: string, pkgRoot: string): string[] {
  const registryPath = path.join(claudeDir, "plugins", "installed_plugins.json");
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(registryPath, '{"version":2,"plugins":{}}');
  }

  const reg = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  const key = `${PLUGIN_NAME}@local`;
  const now = new Date().toISOString();
  const current = Array.isArray(reg.plugins?.[key]) ? reg.plugins[key][0] : null;
  if (!reg.plugins) reg.plugins = {};
  reg.plugins[key] = [{
    scope: "user",
    installPath: pkgRoot,
    version: "local",
    installedAt: current?.installedAt || now,
    lastUpdated: now,
  }];
  fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2) + "\n");
  return ["Updated installed_plugins.json"];
}

function linkCommands(claudeDir: string, pkgRoot: string): string[] {
  const commandsDir = path.join(claudeDir, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(path.join(commandsDir, PLUGIN_NAME), { recursive: true });

  const sourceCommandsDir = path.join(pkgRoot, "commands");
  if (!fs.existsSync(sourceCommandsDir)) return ["No commands directory found, skipping command links."];

  const linked: string[] = [];
  for (const file of fs.readdirSync(sourceCommandsDir)) {
    if (!file.endsWith(".md")) continue;
    const source = path.join(sourceCommandsDir, file);
    for (const target of [
      path.join(commandsDir, file),
      path.join(commandsDir, PLUGIN_NAME, file),
    ]) {
      try {
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
          fs.unlinkSync(target);
        }
        if (!fs.existsSync(target)) {
          fs.symlinkSync(source, target);
        }
      } catch { /* best effort */ }
    }
    linked.push(file);
  }
  return [linked.length > 0 ? `Linked ${linked.length} slash commands` : "No commands to link"];
}
