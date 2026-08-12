import fs from "fs";
import path from "path";
import { resolvePkgRoot } from "./detect.js";

// Codex spawns MCP servers and hooks with a sanitized PATH that may not
// include the node/npm bin dir (e.g. nvm installs), so a bare "cogni-code"
// fails with ENOENT. Resolve absolute paths at install time instead.
export function resolveCliInvocation(): { nodeBin: string; cliJs: string } {
  return {
    nodeBin: process.execPath,
    cliJs: path.join(resolvePkgRoot(), "dist", "graph-memory", "cli.js"),
  };
}

function hookCommand(event: string): string {
  const { nodeBin, cliJs } = resolveCliInvocation();
  return `"${nodeBin}" "${cliJs}" hook ${event}`;
}

function buildCodexHooks(): Record<string, Array<{ matcher?: string; command: string }>> {
  return {
    SessionStart: [
      { matcher: "startup|resume|clear|compact", command: hookCommand("session-start") },
    ],
    UserPromptSubmit: [
      { command: hookCommand("user-prompt-submit") },
    ],
    PreToolUse: [
      {
        matcher: "mcp__graph-memory__graph_memory",
        command: `echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'`,
      },
    ],
    PostToolUse: [
      { command: hookCommand("post-tool-use") },
    ],
    PreCompact: [
      { matcher: "manual|auto", command: hookCommand("pre-compact") },
    ],
    Stop: [
      { command: hookCommand("stop") },
    ],
  };
}

export function installCodex(codexDir: string): string[] {
  const messages: string[] = [];
  fs.mkdirSync(codexDir, { recursive: true });

  const configTomlPath = path.join(codexDir, "config.toml");
  const hooksJsonPath = path.join(codexDir, "hooks.json");

  messages.push(...registerMcp(configTomlPath));
  messages.push(...mergeHooks(hooksJsonPath));
  messages.push(...installPrompts(codexDir));

  return messages;
}

// Codex has no plugin command system; custom prompts in ~/.codex/prompts/
// are its equivalent of slash commands (/memory-onboard, /memory-status, …).
function installPrompts(codexDir: string): string[] {
  const sourceDir = path.join(resolvePkgRoot(), "commands");
  if (!fs.existsSync(sourceDir)) return [];

  const promptsDir = path.join(codexDir, "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });

  let count = 0;
  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".md")) continue;
    fs.copyFileSync(path.join(sourceDir, file), path.join(promptsDir, file));
    count++;
  }
  return count > 0 ? [`Installed ${count} slash-command prompts in ${promptsDir}`] : [];
}

function registerMcp(configTomlPath: string): string[] {
  if (!fs.existsSync(configTomlPath)) {
    fs.writeFileSync(configTomlPath, "# Codex CLI configuration\n");
  }

  let toml = fs.readFileSync(configTomlPath, "utf-8");

  const lines = toml.split("\n");
  const out: string[] = [];
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
  let body = out.join("\n").replace(/\s+$/, "");

  const { nodeBin, cliJs } = resolveCliInvocation();
  body += [
    "",
    "",
    "[mcp_servers.graph-memory]",
    `command = ${JSON.stringify(nodeBin)}`,
    `args = [${JSON.stringify(cliJs)}, "mcp"]`,
    "",
  ].join("\n");

  fs.writeFileSync(configTomlPath, body + "\n");
  return [`Registered MCP server in ${configTomlPath}`];
}

function mergeHooks(hooksJsonPath: string): string[] {
  const incoming = buildIncomingHooks();

  let existing: any = { hooks: {} };
  try {
    const raw = fs.readFileSync(hooksJsonPath, "utf-8");
    existing = JSON.parse(raw);
    if (!existing.hooks) existing.hooks = {};
  } catch {
    // No existing hooks file
  }

  for (const [event, matcherGroups] of Object.entries(incoming)) {
    if (!existing.hooks[event]) existing.hooks[event] = [];
    existing.hooks[event] = existing.hooks[event].filter((group: any) => {
      const groupStr = JSON.stringify(group);
      if (JSON.stringify(matcherGroups).includes(groupStr)) return false;
      const hooks = group.hooks || [];
      // Match our own entries (bare or absolute CLI) plus the shell
      // installer's wrapper-script entries, so switching install methods
      // replaces rather than duplicates.
      const shellWrapper = /(cogni-code|graph-memory)[^\s"']*[\\/](?:bin[\\/](?:session-start|on-user-message|on-post-tool-use|on-pre-compact|on-assistant-response|session-end)\.sh|dist[\\/]hooks[\\/][\w-]+\.js)/;
      return !hooks.some((h: any) =>
        typeof h.command === "string" &&
        (h.command.includes("cogni-code hook") ||
          h.command.includes(`cli.js" hook`) ||
          shellWrapper.test(h.command))
      );
    });
    existing.hooks[event].push(...matcherGroups);
  }

  delete existing._comment;
  fs.writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + "\n");
  return [`Merged lifecycle hooks into ${hooksJsonPath}`];
}

function buildIncomingHooks(): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const [event, entries] of Object.entries(buildCodexHooks())) {
    result[event] = entries.map((e) => ({
      ...(e.matcher ? { matcher: e.matcher } : {}),
      hooks: [{ type: "command", command: e.command }],
    }));
  }
  return result;
}
