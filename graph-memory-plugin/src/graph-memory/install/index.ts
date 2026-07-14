import { detectHarnesses, resolvePkgRoot, HarnessInfo } from "./detect.js";
import { installCodex } from "./codex.js";
import { installClaudeCode } from "./claude-code.js";
import { isGraphInitialized, saveGlobalConfig, reloadConfig, CONFIG } from "../config.js";
import { initializeGraph } from "../index.js";
import { saveRuntimeConfig, loadRuntimeConfig, WorkerProvider } from "../runtime.js";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export async function runInstall(args: string[]): Promise<void> {
  let customGraphRoot: string | null = null;
  let enableDocker = false;
  let workerOverride: string | null = null;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--graph-root" && i + 1 < args.length) {
      customGraphRoot = args[i + 1];
      i++;
    } else if (args[i].startsWith("--graph-root=")) {
      customGraphRoot = args[i].slice("--graph-root=".length);
    } else if (args[i] === "--docker") {
      enableDocker = true;
    } else if (args[i] === "--worker" && i + 1 < args.length) {
      workerOverride = args[i + 1];
      i++;
    } else if (args[i].startsWith("--worker=")) {
      workerOverride = args[i].slice("--worker=".length);
    } else {
      filteredArgs.push(args[i]);
    }
  }
  const flags = filteredArgs.filter((a) => a.startsWith("--"));

  console.log("── Graph Memory ──");
  const graphMsg = ensureGraphInitialized(customGraphRoot);
  console.log(`  ${graphMsg}\n`);

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

  if (enableDocker) {
    console.log();
    setupDocker(workerOverride);
  }

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

function ensureGraphInitialized(customGraphRoot: string | null): string {
  if (isGraphInitialized()) {
    reloadConfig();
    return `Using existing graph at ${CONFIG.paths.graphRoot}`;
  }

  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const graphRoot = customGraphRoot
    ? path.resolve(customGraphRoot.replace(/^~/, home))
    : path.join(home, ".graph-memory");

  const normalized = graphRoot.replace(/\/+$/, "");
  const dangerous = ["/etc", "/usr", "/var", "/bin", "/sbin", "/lib", "/sys", "/proc"];
  if (normalized === "/" || dangerous.some((d) => normalized === d || normalized.startsWith(d + "/"))) {
    throw new Error(`Refusing to initialize graph at system path: ${graphRoot}`);
  }

  saveGlobalConfig(graphRoot);
  reloadConfig();
  initializeGraph();

  return `Initialized new graph at ${graphRoot}`;
}

function setupDocker(workerOverride: string | null): void {
  console.log("── Docker Daemon ──");

  const engine = detectContainerEngine();
  if (!engine) {
    console.error("  Docker/Podman not found. Install Docker Desktop or Podman, then run:");
    console.error("    cogni-code install --docker");
    console.error("  Skipping Docker setup — running in manual mode.");
    return;
  }
  console.log(`  Container engine: ${engine}`);

  const provider = resolveWorkerProvider(workerOverride);
  console.log(`  Worker provider: ${provider}`);

  saveRuntimeConfig({
    mode: "docker",
    docker: { enabled: true, workerProvider: provider },
  });

  const bootstrapScript = path.join(resolvePkgRoot(), "bin", "docker-bootstrap.sh");
  if (!fs.existsSync(bootstrapScript)) {
    console.error(`  Bootstrap script not found: ${bootstrapScript}`);
    console.error("  Docker mode configured but container not started.");
    console.error("  Run bin/docker-bootstrap.sh manually from the package directory.");
    return;
  }

  console.log("  Building image and starting container...\n");
  const result = spawnSync("bash", [bootstrapScript], {
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.status === 0) {
    console.log("\n  Docker daemon is running.");
  } else {
    console.error("\n  Docker bootstrap failed. The runtime is configured for docker mode");
    console.error("  but the container may not have started. Check bin/docker-doctor.sh");
    console.error("  or switch back to manual mode: cogni-code install (without --docker)");
  }
}

function detectContainerEngine(): string | null {
  for (const cmd of ["docker", "podman"]) {
    try {
      const r = spawnSync("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
      if (r.status === 0) return cmd;
    } catch { /* try next */ }
  }
  return null;
}

function resolveWorkerProvider(override: string | null): WorkerProvider {
  if (override) {
    const valid: WorkerProvider[] = ["codex", "claude", "pi", "opencode"];
    if (valid.includes(override as WorkerProvider)) return override as WorkerProvider;
    console.error(`  Unknown worker: ${override}, auto-detecting...`);
  }
  const runtime = loadRuntimeConfig();
  return runtime.docker.workerProvider;
}
