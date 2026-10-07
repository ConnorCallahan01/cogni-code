import fs from "fs";
import path from "path";
import { loadJsonConfigForUpdate, readJsonConfig } from "./json-config.js";

export function installOpencode(opencodeDir: string, pkgRoot: string): string[] {
  const pluginsDir = path.join(opencodeDir, "plugins");
  const commandsDir = path.join(opencodeDir, "commands");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });

  const messages: string[] = [];
  const extSource = path.join(pkgRoot, "extensions", "graph-memory-opencode.ts");
  const extTarget = path.join(pluginsDir, "graph-memory.ts");

  if (fs.existsSync(extSource)) {
    try {
      if (fs.lstatSync(extTarget).isSymbolicLink()) fs.unlinkSync(extTarget);
    } catch { /* doesn't exist, fine */ }
    if (fs.existsSync(extTarget)) fs.unlinkSync(extTarget);
    fs.copyFileSync(extSource, extTarget);
    messages.push(`Installed extension: ${extTarget}`);
  }

  const sourceCommandsDir = path.join(pkgRoot, "opencode-commands");
  if (fs.existsSync(sourceCommandsDir)) {
    let count = 0;
    for (const file of fs.readdirSync(sourceCommandsDir)) {
      if (!file.endsWith(".md")) continue;
      const source = path.join(sourceCommandsDir, file);
      const target = path.join(commandsDir, file);
      try {
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
          fs.unlinkSync(target);
        }
        if (!fs.existsSync(target)) {
          fs.symlinkSync(source, target);
        }
      } catch { /* best effort */ }
      count++;
    }
    if (count > 0) messages.push(`Linked ${count} commands`);
  }

  messages.push(registerMcp(opencodeDir, pkgRoot));
  return messages;
}

// opencode reads opencode.json or opencode.jsonc and accepts comments and
// trailing commas, so a config we can't parse strictly is someone's config,
// not a missing one.
function registerMcp(opencodeDir: string, pkgRoot: string): string {
  const jsonc = path.join(opencodeDir, "opencode.jsonc");
  const json = path.join(opencodeDir, "opencode.json");
  const configPath = !fs.existsSync(json) && fs.existsSync(jsonc) ? jsonc : json;

  // Absolute paths: OpenCode may spawn MCP servers without the node/npm bin
  // dir (e.g. nvm installs) on PATH, so a bare "cogni-code" fails to launch.
  const cliJs = path.join(pkgRoot, "dist", "graph-memory", "cli.js");
  const entry = { type: "local", command: [process.execPath, cliJs, "mcp"], enabled: true };

  const existing = readJsonConfig(configPath);
  if (existing.status === "ok" && sameMcpEntry(existing.value.mcp?.["graph-memory"], entry)) {
    return `MCP already registered in ${configPath}`;
  }

  let config: Record<string, any>;
  try {
    config = loadJsonConfigForUpdate(configPath, `Add this under "mcp" yourself: "graph-memory": ${JSON.stringify(entry)}`);
  } catch (err: any) {
    return `Warning: ${err.message}`;
  }
  if (existing.status === "missing") config.$schema = "https://opencode.ai/config.json";
  config.mcp = { ...(config.mcp || {}), "graph-memory": entry };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  return `Registered MCP in ${configPath}`;
}

function sameMcpEntry(current: any, wanted: { type: string; command: string[]; enabled: boolean }): boolean {
  return (
    current?.type === wanted.type &&
    current?.enabled !== false &&
    JSON.stringify(current?.command) === JSON.stringify(wanted.command)
  );
}
