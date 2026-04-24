import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { CONFIG } from "../config.js";
import { loadRuntimeConfig } from "../runtime.js";

export interface WorkerRunOptions {
  name: string;
  prompt: string;
  logDir: string;
  graphRoot: string;
  addDirs?: string[];
  model?: string;
  budgetUsd?: number;
  timeoutMs?: number;
}

export interface WorkerRunResult {
  exitCode: number;
  logFile: string;
  pid: number | undefined;
}

export async function runPipelineWorker(opts: WorkerRunOptions): Promise<WorkerRunResult> {
  const runtime = loadRuntimeConfig();
  const inDockerRuntime = runtime.mode === "docker" && process.env.GRAPH_MEMORY_ROOT === runtime.docker.graphRootInContainer;
  const authHome = inDockerRuntime
    ? runtime.docker.authPathInContainer
    : process.env.HOME;
  const sandboxMode = inDockerRuntime ? "danger-full-access" : "workspace-write";
  if (!fs.existsSync(opts.logDir)) {
    fs.mkdirSync(opts.logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(opts.logDir, `${opts.name}-${timestamp}.log`);
  const fd = fs.openSync(logFile, "w");

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--cd", os.tmpdir(),
    "--color", "never",
  ];

  if (inDockerRuntime) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("--sandbox", sandboxMode, "--full-auto");
  }

  if (opts.model) {
    args.splice(args.length - 1, 0, "--model", opts.model);
  }

  for (const dir of opts.addDirs || []) {
    args.push("--add-dir", dir);
  }
  args.push("--add-dir", opts.graphRoot);
  args.push(opts.prompt);

  const child = spawn("codex", args, {
    cwd: os.tmpdir(),
    stdio: ["ignore", fd, fd],
    env: {
      ...process.env,
      ...(authHome ? { HOME: authHome } : {}),
      GRAPH_MEMORY_DAEMON: "1",
      GRAPH_MEMORY_WORKER: "1",
      GRAPH_MEMORY_CHILD: "1",
    },
  });

  const pid = child.pid;

  const timeoutMs = Math.max(30_000, opts.timeoutMs ?? CONFIG.session.workerTimeoutMs ?? 300_000);
  let timedOut = false;
  let forceKillTimer: NodeJS.Timeout | null = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch { /* ignore */ }

    forceKillTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch { /* ignore */ }
    }, 5_000);
  }, timeoutMs);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  clearTimeout(timeout);
  if (forceKillTimer) {
    clearTimeout(forceKillTimer);
  }

  try {
    fs.closeSync(fd);
  } catch { /* ignore */ }

  if (timedOut) {
    throw new Error(`Worker timed out after ${timeoutMs}ms. See ${logFile}`);
  }

  return { exitCode, logFile, pid };
}
