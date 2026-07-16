import fs from "fs";
import os from "os";
import path from "path";
import { spawn, SpawnOptions } from "child_process";
import { loadRuntimeConfig, WorkerProvider } from "../runtime.js";
import { activityBus } from "../events.js";

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

// ── Harness Adapter Interface ──────────────────────────────────────────────

interface HarnessSpawnPlan {
  command: string;
  args: string[];
  spawnOptions: SpawnOptions;
}

interface HarnessExecuteResult {
  text: string;
}

interface HarnessAdapter {
  buildPlan?(prompt: string, opts: WorkerRunOptions, runtime: ReturnType<typeof loadRuntimeConfig>): HarnessSpawnPlan;
  execute?(prompt: string, opts: WorkerRunOptions, runtime: ReturnType<typeof loadRuntimeConfig>): Promise<HarnessExecuteResult>;
}

// ── Codex Adapter ───────────────────────────────────────────────────────────

const codexAdapter: HarnessAdapter = {
  buildPlan(prompt, opts, runtime) {
    const inDocker = runtime.mode === "docker" &&
      process.env.GRAPH_MEMORY_ROOT === runtime.docker.graphRootInContainer;
    const authHome = inDocker
      ? runtime.docker.authPathInContainer
      : process.env.HOME;
    const sandboxMode = inDocker ? "danger-full-access" : "workspace-write";

    const args = [
      "exec",
      "--skip-git-repo-check",
      "--cd", os.tmpdir(),
      "--color", "never",
    ];

    if (inDocker) {
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
    args.push(prompt);

    return {
      command: "codex",
      args,
      spawnOptions: {
        cwd: os.tmpdir(),
        stdio: ["ignore", "pipe", "pipe"] as const,
        env: {
          ...process.env,
          ...(authHome ? { HOME: authHome } : {}),
          GRAPH_MEMORY_DAEMON: "1",
          GRAPH_MEMORY_WORKER: "1",
          GRAPH_MEMORY_CHILD: "1",
        },
      },
    };
  },
};

// ── Claude Code Adapter ─────────────────────────────────────────────────────

const claudeAdapter: HarnessAdapter = {
  buildPlan(prompt, opts, _runtime) {
    const model = opts.model || "sonnet";
    const budget = opts.budgetUsd || 0.10;
    // Claude tool names are title-case: Read, Write, Edit, Bash, Grep, Glob, Find
    const allowedTools = "Read,Write,Edit,Bash,Grep,Glob";

    const args = [
      "-p", prompt,
      "--model", model,
      "--max-budget-usd", String(budget),
      "--allowedTools", allowedTools,
      "--add-dir", opts.graphRoot,
      "--output-format", "text",
    ];

    for (const dir of opts.addDirs || []) {
      args.push("--add-dir", dir);
    }

    return {
      command: "claude",
      args,
      spawnOptions: {
        cwd: os.tmpdir(),
        stdio: ["ignore", "pipe", "pipe"] as const,
        env: {
          ...process.env,
          GRAPH_MEMORY_PIPELINE_CHILD: "1",
        },
      },
    };
  },
};

// ── Pi Adapter ──────────────────────────────────────────────────────────────

const piAdapter: HarnessAdapter = {
  buildPlan(prompt, opts, _runtime) {
    const args = [
      "--print", prompt,
      "--tools", "read,write,edit,bash,find",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-session",
      "--color", "never",
    ];

    if (opts.model) {
      args.unshift("--model", opts.model);
    }

    return {
      command: "pi",
      args,
      spawnOptions: {
        // Run from graph root so pi's tools can access the graph data
        cwd: opts.graphRoot,
        stdio: ["ignore", "pipe", "pipe"] as const,
        env: {
          ...process.env,
          GRAPH_MEMORY_PIPELINE_CHILD: "1",
        },
      },
    };
  },
};

// ── OpenCode Adapter ───────────────────────────────────────────────────────

const opencodeAdapter: HarnessAdapter = {
  buildPlan(prompt, opts, runtime) {
    const inDocker = runtime.mode === "docker" &&
      process.env.GRAPH_MEMORY_ROOT === runtime.docker.graphRootInContainer;
    const authHome = inDocker
      ? runtime.docker.authPathInContainer
      : process.env.HOME;

    const args = [
      "run", prompt,
      "--dir", opts.graphRoot,
      "--dangerously-skip-permissions",
    ];

    if (opts.model) {
      args.unshift("--model", opts.model);
    }

    return {
      command: "opencode",
      args,
      spawnOptions: {
        cwd: opts.graphRoot,
        stdio: ["ignore", "pipe", "pipe"] as const,
        env: {
          ...process.env,
          ...(authHome ? { HOME: authHome } : {}),
          GRAPH_MEMORY_PIPELINE_CHILD: "1",
        },
      },
    };
  },
};

// ── Direct API Adapter ──────────────────────────────────────────────────────
// Calls the Anthropic Messages API directly via fetch — no subprocess, no CLI
// binary, no Docker. Respects the standard Anthropic env-var surface so it
// works transparently with credential proxies (e.g. OneCLI Agent Vault in
// NanoClaw containers) that route to a subscription rather than API billing.
//
// Auth precedence (mirrors the Anthropic SDK / Claude Code):
//   1. ANTHROPIC_API_KEY    → x-api-key header      (direct API key)
//   2. ANTHROPIC_AUTH_TOKEN → Authorization: Bearer  (proxy / subscription token)
//   3. ~/.claude/.credentials.json                   (Claude CLI OAuth fallback)

function resolveAnthropicAuth(): { value: string; header: string; headerName: string } | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { value: process.env.ANTHROPIC_API_KEY, header: process.env.ANTHROPIC_API_KEY, headerName: "x-api-key" };
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    return { value: process.env.ANTHROPIC_AUTH_TOKEN, header: `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`, headerName: "Authorization" };
  }
  try {
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    if (creds.claude_ai_os_api_key) {
      return { value: creds.claude_ai_os_api_key, header: creds.claude_ai_os_api_key, headerName: "x-api-key" };
    }
  } catch { /* credentials file absent or unreadable */ }
  return null;
}

const apiAdapter: HarnessAdapter = {
  async execute(prompt, opts, runtime) {
    const auth = resolveAnthropicAuth();
    if (!auth) {
      throw new Error(
        "No Anthropic credentials found. Set ANTHROPIC_API_KEY (direct API) " +
        "or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (proxy / subscription) " +
        "to use the 'api' worker provider."
      );
    }

    const model = opts.model
      || runtime.docker.workerModel
      || "claude-sonnet-4-20250514";

    const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";

    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        [auth.headerName]: auth.header,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

    const data = await res.json() as any;
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return { text };
  },
};

// ── Harness Dispatch ────────────────────────────────────────────────────────

const ADAPTERS: Record<WorkerProvider, HarnessAdapter> = {
  codex: codexAdapter,
  claude: claudeAdapter,
  pi: piAdapter,
  opencode: opencodeAdapter,
  api: apiAdapter,
};

function resolveHarness(): WorkerProvider {
  // 1. Explicit env override
  if (process.env.GRAPH_MEMORY_WORKER_PROVIDER) {
    const v = process.env.GRAPH_MEMORY_WORKER_PROVIDER as WorkerProvider;
    if (ADAPTERS[v]) return v;
    console.error(`[graph-memory] Unknown GRAPH_MEMORY_WORKER_PROVIDER=${v}, falling back`);
  }

  // 2. Runtime config
  try {
    const runtime = loadRuntimeConfig();
    if (runtime.mode === "docker" && ADAPTERS[runtime.docker.workerProvider]) {
      return runtime.docker.workerProvider;
    }
    // For manual mode, check if the runtime config has a worker provider set
    // (configureRuntime stores it in docker.workerProvider regardless of mode)
    if (ADAPTERS[runtime.docker.workerProvider]) {
      return runtime.docker.workerProvider;
    }
  } catch {
    // Fall through
  }

  // 3. Auto-detect: CLI binary on PATH, then API credentials, then codex
  // Containerized agents (e.g. NanoClaw) set ANTHROPIC_AUTH_TOKEN + BASE_URL
  // routed through a credential proxy; direct setups use ANTHROPIC_API_KEY.
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "api";
  return "codex";
}

// ── Fallback Resolution ──────────────────────────────────────────────────────

export interface WorkerAttempt {
  provider: WorkerProvider;
  model?: string;
}

/**
 * Resolve the user-configured fallback worker, if any. An env override takes
 * precedence over the persisted runtime config, mirroring resolveHarness().
 * Returns null when no fallback is configured — the default is no fallback, so
 * behavior is unchanged unless the user opts in.
 */
function resolveFallback(runtime: ReturnType<typeof loadRuntimeConfig>): WorkerAttempt | null {
  const envProvider = process.env.GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER as WorkerProvider | undefined;
  const provider =
    envProvider && ADAPTERS[envProvider]
      ? envProvider
      : runtime.docker.fallbackProvider && ADAPTERS[runtime.docker.fallbackProvider]
        ? runtime.docker.fallbackProvider
        : undefined;
  if (!provider) return null;
  const model =
    process.env.GRAPH_MEMORY_WORKER_FALLBACK_MODEL ||
    runtime.docker.fallbackModel ||
    undefined;
  return { provider, model };
}

/**
 * Build the ordered list of worker attempts: primary first, then the fallback,
 * but only when the fallback actually differs (different provider or model).
 */
export function planWorkerAttempts(primary: WorkerAttempt, fallback: WorkerAttempt | null): WorkerAttempt[] {
  const attempts: WorkerAttempt[] = [primary];
  if (
    fallback &&
    (fallback.provider !== primary.provider ||
      (fallback.model || undefined) !== (primary.model || undefined))
  ) {
    attempts.push(fallback);
  }
  return attempts;
}

// ── Main Runner ─────────────────────────────────────────────────────────────

interface AttemptResult {
  exitCode: number;
  logFile: string;
  pid: number | undefined;
  timedOut: boolean;
}

async function runWorkerAttempt(
  attempt: WorkerAttempt,
  opts: WorkerRunOptions,
  runtime: ReturnType<typeof loadRuntimeConfig>
): Promise<AttemptResult> {
  const adapter = ADAPTERS[attempt.provider];
  if (!adapter) {
    throw new Error(`Unsupported worker harness: ${attempt.provider}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(opts.logDir, `${opts.name}-${attempt.provider}-${timestamp}.log`);
  const timeoutMs = Math.max(30_000, opts.timeoutMs ?? 300_000);

  // ── In-process path: direct API call, no subprocess ──
  if (adapter.execute) {
    const startedAt = new Date().toISOString();
    activityBus.log("system:info", `Worker (${attempt.provider}): ${opts.name} via API`, { harness: attempt.provider, logFile });

    let timedOut = false;
    let exitCode: number;
    try {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, timeoutMs)
      );
      const result = await Promise.race([
        adapter.execute(opts.prompt, { ...opts, model: attempt.model }, runtime),
        timer,
      ]);
      fs.writeFileSync(logFile, result.text);
      exitCode = 0;
    } catch (err: any) {
      fs.writeFileSync(logFile, `[${attempt.provider}] ${err?.message || err}`);
      exitCode = 1;
      activityBus.log("system:error", `Worker (${attempt.provider}) API error: ${err?.message || err}`, { harness: attempt.provider });
    }

    const metaPath = logFile + ".meta.json";
    try {
      fs.writeFileSync(metaPath, JSON.stringify({
        name: opts.name,
        harness: attempt.provider,
        model: attempt.model ?? null,
        pid: undefined,
        startedAt,
        logFile,
        exitCode,
        timedOut,
        finishedAt: new Date().toISOString(),
        status: exitCode === 0 && !timedOut ? "completed" : "failed",
      }, null, 2));
    } catch { /* ignore */ }

    return { exitCode, logFile, pid: undefined, timedOut };
  }

  // ── Subprocess path: spawn a CLI harness ──
  const fd = fs.openSync(logFile, "w");

  const plan = adapter.buildPlan!(opts.prompt, { ...opts, model: attempt.model }, runtime);

  // Redirect stdio to log file for detached output
  plan.spawnOptions.stdio = ["ignore", fd, fd];

  const child = spawn(plan.command, plan.args, {
    ...plan.spawnOptions,
    detached: true,
  });

  const pid = child.pid;
  activityBus.log("system:info", `Worker spawned: ${plan.command} ${plan.args.slice(0, 3).join(" ")}... (pid=${pid})`, { harness: attempt.provider, pid, logFile });

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

  let exitCode: number;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } catch (err: any) {
    // Spawn failure (e.g. harness CLI not on PATH) — treat as a failed attempt
    // so the fallback still gets a chance rather than aborting outright.
    activityBus.log("system:error", `Worker spawn error (${attempt.provider}, pid=${pid}): ${err?.message || err}`, { harness: attempt.provider, pid });
    exitCode = 127;
  } finally {
    clearTimeout(timeout);
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    try {
      fs.closeSync(fd);
    } catch { /* ignore */ }
  }

  // Write metadata alongside the log
  const metaPath = logFile + ".meta.json";
  try {
    fs.writeFileSync(metaPath, JSON.stringify({
      name: opts.name,
      harness: attempt.provider,
      model: attempt.model ?? null,
      pid,
      startedAt: new Date().toISOString(),
      logFile,
      exitCode,
      timedOut,
      finishedAt: new Date().toISOString(),
      status: exitCode === 0 && !timedOut ? "completed" : "failed",
    }, null, 2));
  } catch { /* ignore */ }

  return { exitCode, logFile, pid, timedOut };
}

export async function runPipelineWorker(opts: WorkerRunOptions): Promise<WorkerRunResult> {
  const runtime = loadRuntimeConfig();
  const primary: WorkerAttempt = { provider: resolveHarness(), model: opts.model };
  const fallback = resolveFallback(runtime);
  const attempts = planWorkerAttempts(primary, fallback);

  if (!fs.existsSync(opts.logDir)) {
    fs.mkdirSync(opts.logDir, { recursive: true });
  }

  let last: AttemptResult | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (i > 0) {
      const prev = attempts[i - 1];
      activityBus.log(
        "system:info",
        `Worker (${prev.provider}) failed — falling back to ${attempt.provider}${attempt.model ? ` (${attempt.model})` : ""}`,
        { harness: attempt.provider, fallbackFrom: prev.provider }
      );
    }
    last = await runWorkerAttempt(attempt, opts, runtime);
    if (last.exitCode === 0 && !last.timedOut) {
      return { exitCode: last.exitCode, logFile: last.logFile, pid: last.pid };
    }
  }

  // Every attempt failed — preserve the original contract: throw on timeout so
  // the daemon records a timeout, otherwise return the non-zero exit result.
  const lastAttempt = attempts[attempts.length - 1];
  if (last?.timedOut) {
    const timeoutMs = Math.max(30_000, opts.timeoutMs ?? 300_000);
    throw new Error(`Worker (${lastAttempt.provider}) timed out after ${timeoutMs}ms. See ${last.logFile}`);
  }
  return { exitCode: last?.exitCode ?? 1, logFile: last?.logFile ?? "", pid: last?.pid };
}