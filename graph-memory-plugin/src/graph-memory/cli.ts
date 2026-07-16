#!/usr/bin/env node
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOK_SCRIPTS: Record<string, string> = {
  "session-start": "session-start.js",
  "user-prompt-submit": "on-user-message.js",
  "post-tool-use": "on-post-tool-use.js",
  "pre-tool-use": "on-pre-tool-use.js",
  "pre-compact": "on-pre-compact.js",
  "stop": "on-assistant-response.js",
  "session-end": "session-end-launcher.js",
};

function resolvePkgRoot(): string {
  return path.join(__dirname, "..", "..");
}

function printHelp(): void {
  const pkg = readPkg();
  console.log(`
cogni-code v${pkg.version} — Persistent, self-evolving memory for AI agents

Usage:
  cogni-code install [--claude|--codex|--opencode|--all] [--docker] [--worker <provider>]
                                                          Set up for your harness(es)
  cogni-code install --graph-root <path>                  Use a custom graph memory location
  cogni-code hook <event>                                 Run a hook handler (stdin passthrough)
  cogni-code mcp                                          Start the MCP server (stdio transport)
  cogni-code status                                       Show graph memory health
  cogni-code --version                                    Print version

Flags:
  --docker        Also set up the Docker daemon for background pipeline processing
  --worker <p>    Worker provider for pipeline (codex, claude, opencode, pi, or api for direct Anthropic API)
  --graph-root    Custom graph memory storage location (first-time init only)

Hook events:
  session-start, user-prompt-submit, post-tool-use, pre-tool-use,
  pre-compact, stop, session-end
`);
}

function readPkg(): { version: string; name: string } {
  return JSON.parse(fs.readFileSync(path.join(resolvePkgRoot(), "package.json"), "utf-8"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(readPkg().version);
    return;
  }

  if (command === "mcp") {
    await import("./mcp-server.js");
    return;
  }

  if (command === "hook") {
    const event = args[1];
    if (!event || !HOOK_SCRIPTS[event]) {
      console.error(`Unknown hook event: ${event || "(none)"}`);
      console.error(`Available: ${Object.keys(HOOK_SCRIPTS).join(", ")}`);
      process.exit(1);
    }
    const hookPath = path.join(__dirname, "..", "hooks", HOOK_SCRIPTS[event]);
    if (!fs.existsSync(hookPath)) {
      console.error(`Hook handler not found: ${hookPath}`);
      console.error("The package may need to be rebuilt. Run: npm run build");
      process.exit(1);
    }
    const child = spawn(process.execPath, [hookPath], {
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    child.on("error", (err) => {
      console.error(`cogni-code hook error: ${err.message}`);
      process.exit(1);
    });
    return;
  }

  if (command === "install") {
    const { runInstall } = await import("./install/index.js");
    await runInstall(args.slice(1));
    return;
  }

  if (command === "status") {
    try {
      const tools = await import("./tools.js");
      const result = await tools.handleGraphMemory({ action: "status" });
      if (result?.content?.[0]?.text) {
        console.log(result.content[0].text);
      }
    } catch (err: any) {
      console.error(`cogni-code: ${err.message}`);
      console.error("Memory may not be initialized. Run: cogni-code install");
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`cogni-code: ${err.message}`);
  process.exit(1);
});
