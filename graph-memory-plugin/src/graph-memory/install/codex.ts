import fs from "fs";
import path from "path";
import { resolvePkgRoot } from "./detect.js";

const CLI_BIN = "cogni-code";

const CODEX_HOOKS: Record<string, Array<{ matcher?: string; command: string }>> = {
  SessionStart: [
    { matcher: "startup|resume|clear|compact", command: `${CLI_BIN} hook session-start` },
  ],
  UserPromptSubmit: [
    { command: `${CLI_BIN} hook user-prompt-submit` },
  ],
  PreToolUse: [
    {
      matcher: "mcp__graph-memory__graph_memory",
      command: `echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'`,
    },
  ],
  PostToolUse: [
    { command: `${CLI_BIN} hook post-tool-use` },
  ],
  PreCompact: [
    { matcher: "manual|auto", command: `${CLI_BIN} hook pre-compact` },
  ],
  Stop: [
    { command: `${CLI_BIN} hook stop` },
  ],
};

export function installCodex(codexDir: string): string[] {
  const messages: string[] = [];
  fs.mkdirSync(codexDir, { recursive: true });

  const configTomlPath = path.join(codexDir, "config.toml");
  const hooksJsonPath = path.join(codexDir, "hooks.json");

  messages.push(...registerMcp(configTomlPath));
  messages.push(...mergeHooks(hooksJsonPath));

  return messages;
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

  body += [
    "",
    "",
    "[mcp_servers.graph-memory]",
    `command = "${CLI_BIN}"`,
    `args = ["mcp"]`,
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
      return !hooks.some((h: any) =>
        typeof h.command === "string" && h.command.includes(`${CLI_BIN} hook`)
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
  for (const [event, entries] of Object.entries(CODEX_HOOKS)) {
    result[event] = entries.map((e) => ({
      ...(e.matcher ? { matcher: e.matcher } : {}),
      hooks: [{ type: "command", command: e.command }],
    }));
  }
  return result;
}
