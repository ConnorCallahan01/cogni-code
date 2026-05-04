/**
 * @deprecated Use worker-runner.ts harness adapters instead.
 *
 * Detached pipeline agent spawner (legacy Claude Code path).
 *
 * Fires scribe/auditor/librarian/dreamer as completely decoupled `claude` CLI
 * processes. Uses normal OAuth auth (not --bare) but spawns from /tmp to avoid
 * triggering project hooks (prevents recursive hook dispatch).
 *
 * The main conversation never sees these agents — no stdout pollution, no
 * completion notifications, no interruptions.
 *
 * This file is retained for reference. The active dispatch path is now in
 * worker-runner.ts, which routes to codex/claude/pi adapters based on the
 * workerProvider field in the runtime config.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export interface PipelineSpawnOptions {
  /** Pipeline stage name: "scribe" | "auditor" | "librarian" | "dreamer" */
  name: string;
  /** Full prompt for the claude CLI */
  prompt: string;
  /** Model to use (default: "sonnet") */
  model?: string;
  /** Max spend in USD (default: 0.10) */
  budgetUsd?: number;
  /** Directory for pipeline execution logs */
  logDir: string;
  /** Graph root directory — granted via --add-dir */
  graphRoot: string;
  /** Additional directories to grant access to */
  addDirs?: string[];
}

/**
 * Spawn a pipeline agent as a fully detached claude CLI process.
 * Returns the log file path for dashboard visibility.
 */
export function spawnPipelineAgent(opts: PipelineSpawnOptions): string {
  // Ensure log directory exists
  if (!fs.existsSync(opts.logDir)) {
    fs.mkdirSync(opts.logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(opts.logDir, `${opts.name}-${timestamp}.log`);
  const fd = fs.openSync(logFile, "w");

  const args = [
    "-p", opts.prompt,
    "--model", opts.model || "sonnet",
    "--max-budget-usd", String(opts.budgetUsd || 0.10),
    "--allowedTools", "Read,Write,Glob,Grep,Bash",  // file ops only, no Agent tool
    "--add-dir", opts.graphRoot,
    "--output-format", "text",
  ];

  // Add any extra directories
  for (const dir of opts.addDirs || []) {
    args.push("--add-dir", dir);
  }

  // Spawn from /tmp to avoid triggering project hooks (prevents recursion).
  // Normal OAuth auth is preserved (unlike --bare which requires ANTHROPIC_API_KEY).
  const child = spawn("claude", args, {
    detached: true,
    cwd: os.tmpdir(),
    stdio: ["ignore", fd, fd],  // stdout+stderr -> log file
    env: {
      ...process.env,
      GRAPH_MEMORY_PIPELINE_CHILD: "1",
    },
  });

  const metaPath = logFile + ".meta.json";
  const meta = {
    name: opts.name,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    logFile,
    model: opts.model || "sonnet",
    budgetUsd: opts.budgetUsd || 0.10,
    status: "running" as string,
    finishedAt: null as string | null,
    exitCode: null as number | null,
  };

  // Write initial metadata
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch { /* non-critical */ }

  // Track exit — updates meta with exit code and finish time
  child.on("exit", (code) => {
    try {
      meta.status = code === 0 ? "completed" : "failed";
      meta.exitCode = code;
      meta.finishedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* best effort */ }
  });

  child.unref();  // don't keep parent alive

  // Close the fd after spawn — the child inherits it
  try { fs.closeSync(fd); } catch { /* ignore */ }

  console.error(`[graph-memory] Spawned ${opts.name} (pid ${child.pid}) -> ${logFile}`);

  return logFile;
}

/**
 * Clean up old pipeline logs (>24 hours).
 */
export function cleanPipelineLogs(logDir: string): void {
  if (!fs.existsSync(logDir)) return;
  try {
    const cutoff = Date.now() - 86_400_000; // 24 hours
    for (const file of fs.readdirSync(logDir)) {
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch { /* best effort */ }
}
