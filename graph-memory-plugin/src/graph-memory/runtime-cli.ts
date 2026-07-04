import { execSync } from "child_process";
import { getRuntimeStatus, loadRuntimeConfig } from "./runtime.js";

function quote(value: string): string {
  return JSON.stringify(value);
}

function commandExists(cmd: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Prefer docker; fall back to podman, which is CLI-compatible for every
// primitive the docker-*.sh scripts use (run/exec/cp/build/logs/rm/stop/
// inspect) — so scripts don't need per-engine branches, just a `docker`
// that resolves to whichever engine is actually installed.
function detectContainerEngine(): "docker" | "podman" | "" {
  if (commandExists("docker")) return "docker";
  if (commandExists("podman")) return "podman";
  return "";
}

async function main() {
  const cmd = process.argv[2] || "status";

  switch (cmd) {
    case "docker-env": {
      const runtime = loadRuntimeConfig();
      const docker = runtime.docker;
      // Git Bash's MSYS runtime rewrites any argv token containing what
      // looks like a POSIX absolute path (bare, or after `VAR=`) into a
      // Windows path rooted at the Git install dir before it ever reaches
      // docker.exe/podman.exe — corrupting container-internal paths like
      // `-e HOME=/graph-memory-auth`. Doubling the leading slash is the
      // standard escape hatch: MSYS skips conversion for `//`-prefixed
      // paths, and Linux collapses the doubled slash back to one, so the
      // container sees the same path either way.
      const containerPath = (p: string) => (process.platform === "win32" ? `/${p}` : p);
      process.stdout.write(`GRAPH_MEMORY_RUNTIME_MODE=${quote(runtime.mode)}\n`);
      process.stdout.write(`GRAPH_MEMORY_HOST_ROOT=${quote(runtime.graphRoot)}\n`);
      process.stdout.write(`GRAPH_MEMORY_WORKER_PROVIDER=${quote(docker.workerProvider)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_IMAGE=${quote(docker.image)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_CONTAINER=${quote(docker.containerName)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_AUTH_VOLUME=${quote(docker.authVolume)}\n`);
      process.stdout.write(`GRAPH_MEMORY_CONTAINER_ROOT=${quote(containerPath(docker.graphRootInContainer))}\n`);
      process.stdout.write(`GRAPH_MEMORY_CONTAINER_AUTH_PATH=${quote(containerPath(docker.authPathInContainer))}\n`);
      process.stdout.write(`GRAPH_MEMORY_MEMORY_LIMIT=${quote(docker.memoryLimit)}\n`);
      process.stdout.write(`GRAPH_MEMORY_CPU_LIMIT=${quote(docker.cpuLimit)}\n`);
      process.stdout.write(`GRAPH_MEMORY_REPO_MOUNTS_JSON=${quote(JSON.stringify(docker.repoMounts))}\n`);

      const engine = detectContainerEngine();
      process.stdout.write(`GRAPH_MEMORY_CONTAINER_ENGINE=${quote(engine)}\n`);
      if (engine === "podman") {
        // Callers eval this whole block, so a plain function definition
        // line is valid here: every subsequent literal `docker ...` call
        // in the sourcing script transparently runs against podman instead.
        process.stdout.write(`docker() { podman "$@"; }\n`);
      }
      return;
    }
    case "status":
    default:
      process.stdout.write(JSON.stringify(getRuntimeStatus(), null, 2) + "\n");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
