import { detectHarnesses, resolvePkgRoot, HarnessInfo } from "./detect.js";
import { installCodex } from "./codex.js";
import { installClaudeCode } from "./claude-code.js";
import fs from "fs";
import path from "path";

export async function runInstall(args: string[]): Promise<void> {
  const flags = args.filter((a) => a.startsWith("--"));
  const harnesses = detectHarnesses();

  let targets: HarnessInfo[];
  if (flags.length === 0) {
    const detected = harnesses.filter((h) => h.detected);
    if (detected.length === 0) {
      console.error("No AI harnesses detected.");
      console.error("Install Claude Code, Codex CLI, or OpenCode first, or specify with --claude, --codex, --opencode.");
      process.exit(1);
    }
    targets = detected;
    console.log(`Detected ${detected.map((h) => h.name).join(", ")}\n`);
  } else {
    targets = harnesses.filter((h) => {
      if (flags.includes("--all")) return true;
      if (flags.includes("--claude") && h.id === "claude-code") return true;
      if (flags.includes("--codex") && h.id === "codex") return true;
      if (flags.includes("--opencode") && h.id === "opencode") return true;
      return false;
    });
  }

  const pkgRoot = resolvePkgRoot();
  console.log(`Installing cogni-code from ${pkgRoot}\n`);

  let installed = 0;
  for (const harness of targets) {
    console.log(`── ${harness.name} ──`);
    try {
      let messages: string[];
      switch (harness.id) {
        case "codex":
          messages = installCodex(harness.configDir);
          break;
        case "claude-code":
          messages = installClaudeCode(harness.configDir);
          break;
        case "opencode":
          messages = installOpencode(harness.configDir, pkgRoot);
          break;
        default:
          console.log(`  (not yet supported via CLI — use bin/install-opencode.sh)`);
          continue;
      }
      for (const msg of messages) console.log(`  ${msg}`);
      installed++;
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
    }
    console.log();
  }

  console.log(`Done! Installed for ${installed} harness(es).`);

  if (targets.some((t) => t.id === "codex")) {
    console.log("\nIMPORTANT — Codex hook trust:");
    console.log("  Run /hooks in Codex CLI to review and trust the cogni-code hooks.");
  }
  if (targets.some((t) => t.id === "claude-code")) {
    console.log("\nRestart Claude Code or run /mcp to reconnect.");
  }

  console.log("\nOptional: add memory instructions to your project's AGENTS.md or CLAUDE.md");
  console.log("  by copying a template from the templates/ directory.");
}

function installOpencode(opencodeDir: string, pkgRoot: string): string[] {
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

  const configPath = path.join(opencodeDir, "opencode.json");
  let config: any = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch { /* no config yet */ }
  if (!config.mcp) config.mcp = {};
  config.mcp["graph-memory"] = { type: "local", command: ["cogni-code", "mcp"], enabled: true };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  messages.push(`Registered MCP in ${configPath}`);

  return messages;
}
