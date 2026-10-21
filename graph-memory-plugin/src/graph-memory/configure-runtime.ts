import { getRuntimeStatus, loadRuntimeConfig, saveRuntimeConfig, GraphMemoryRuntimeMode, WorkerProvider, DockerRuntimeConfig } from "./runtime.js";

// Runtime settings change only from the command line, where the user sees and
// approves the command. They used to be a graph_memory action, which a model
// could call on its own.

const USAGE = `Usage: cogni-code configure-runtime [options]

  --mode <manual|docker>       Runtime mode (default: keep the current mode)
  --worker <provider>          Primary pipeline worker: codex, claude, pi, opencode, api
  --worker-model <model>       Model override for the primary worker
  --fallback <provider|none>   Worker to retry on when the primary fails or times out
  --fallback-model <model>     Model for the fallback worker

Prints the previous and new runtime as JSON. Restart the daemon to apply.`;

const FLAGS: Record<string, string> = {
  "--mode": "mode",
  "--worker": "worker",
  "--worker-model": "workerModel",
  "--fallback": "fallback",
  "--fallback-model": "fallbackModel",
};

function parseFlags(argv: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    const key = FLAGS[flag];
    if (!key) throw new Error(`Unknown option: ${argv[i]}`);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value === "") throw new Error(`${flag} needs a value`);
    values[key] = value;
  }
  return values;
}

export function runConfigureRuntime(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  let flags: Record<string, string>;
  try {
    flags = parseFlags(argv);
  } catch (err: any) {
    console.error(`cogni-code configure-runtime: ${err.message}\n\n${USAGE}`);
    process.exit(1);
  }
  if (Object.keys(flags).length === 0) {
    console.log(USAGE);
    return;
  }

  const previous = getRuntimeStatus();
  const mode = (flags.mode || loadRuntimeConfig().mode) as GraphMemoryRuntimeMode;
  const docker: Partial<DockerRuntimeConfig> = { enabled: mode === "docker" };
  if (flags.worker) docker.workerProvider = flags.worker as WorkerProvider;
  if (flags.workerModel) docker.workerModel = flags.workerModel;
  if (flags.fallback && flags.fallback !== "none") docker.fallbackProvider = flags.fallback as WorkerProvider;
  if (flags.fallbackModel) docker.fallbackModel = flags.fallbackModel;
  if (flags.fallback === "none") {
    docker.fallbackProvider = undefined;
    docker.fallbackModel = undefined;
  }

  try {
    const runtime = saveRuntimeConfig({ mode, docker });
    console.log(JSON.stringify({ success: true, previousRuntime: previous, runtime }, null, 2));
  } catch (err: any) {
    console.error(`cogni-code configure-runtime: ${err.message}`);
    process.exit(1);
  }
}
