import fs from "fs";

export interface CodexMcpServerSpec {
  command: string;
  args: string[];
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderArgsArray(args: string[]): string {
  return "[" + args.map((a) => `"${escapeTomlString(a)}"`).join(", ") + "]";
}

function renderServerBlock(name: string, spec: CodexMcpServerSpec): string {
  return [`[mcp_servers.${name}]`, `command = "${escapeTomlString(spec.command)}"`, `args = ${renderArgsArray(spec.args)}`].join(
    "\n"
  );
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches from the table header through to (but not including) the next
// top-level table header, or end of file — i.e. the whole existing block
// for this server, so it can be replaced wholesale.
function sectionBodyPattern(name: string): RegExp {
  return new RegExp(`\\[mcp_servers\\.${escapeForRegex(name)}\\][\\s\\S]*?(?=\\n\\[|$)`);
}

/**
 * Idempotently writes a `[mcp_servers.<name>]` table into a Codex
 * `config.toml`. Hand-rolled instead of a TOML parser because we only ever
 * emit and replace one predictable table shape (command + args); we never
 * need to understand the rest of the user's config.
 */
export function upsertCodexMcpServer(configPath: string, name: string, spec: CodexMcpServerSpec): boolean {
  const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const block = renderServerBlock(name, spec);
  const bodyPattern = sectionBodyPattern(name);
  const match = content.match(bodyPattern);

  if (match) {
    if (match[0].trim() === block.trim()) {
      return false;
    }
    const start = match.index ?? 0;
    const updated = content.slice(0, start) + block + "\n" + content.slice(start + match[0].length);
    fs.writeFileSync(configPath, updated);
    return true;
  }

  let next = content;
  if (next.length && !next.endsWith("\n")) next += "\n";
  if (next.length) next += "\n";
  next += block + "\n";
  fs.writeFileSync(configPath, next);
  return true;
}
