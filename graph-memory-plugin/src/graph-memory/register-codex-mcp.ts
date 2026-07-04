#!/usr/bin/env node
import { upsertCodexMcpServer } from "./codex-mcp-config.js";

const [configPath, name, command, ...args] = process.argv.slice(2);

if (!configPath || !name || !command) {
  console.error("Usage: register-codex-mcp <configPath> <name> <command> [args...]");
  process.exit(1);
}

const changed = upsertCodexMcpServer(configPath, name, { command, args });
console.log(
  changed ? `Registered [mcp_servers.${name}] in ${configPath}` : `[mcp_servers.${name}] already up to date in ${configPath}`
);
