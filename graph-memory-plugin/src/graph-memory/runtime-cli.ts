import { getRuntimeStatus, loadRuntimeConfig } from "./runtime.js";

function quote(value: string): string {
  return JSON.stringify(value);
}

async function main() {
  const cmd = process.argv[2] || "status";

  switch (cmd) {
    case "docker-env": {
      const runtime = loadRuntimeConfig();
      const docker = runtime.docker;
      process.stdout.write(`GRAPH_MEMORY_RUNTIME_MODE=${quote(runtime.mode)}\n`);
      process.stdout.write(`GRAPH_MEMORY_HOST_ROOT=${quote(runtime.graphRoot)}\n`);
      process.stdout.write(`GRAPH_MEMORY_WORKER_PROVIDER=${quote(docker.workerProvider)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_IMAGE=${quote(docker.image)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_CONTAINER=${quote(docker.containerName)}\n`);
      process.stdout.write(`GRAPH_MEMORY_DOCKER_AUTH_VOLUME=${quote(docker.authVolume)}\n`);
      process.stdout.write(`GRAPH_MEMORY_CONTAINER_ROOT=${quote(docker.graphRootInContainer)}\n`);
      process.stdout.write(`GRAPH_MEMORY_CONTAINER_AUTH_PATH=${quote(docker.authPathInContainer)}\n`);
      process.stdout.write(`GRAPH_MEMORY_MEMORY_LIMIT=${quote(docker.memoryLimit)}\n`);
      process.stdout.write(`GRAPH_MEMORY_CPU_LIMIT=${quote(docker.cpuLimit)}\n`);
      process.stdout.write(`GRAPH_MEMORY_REPO_MOUNTS_JSON=${quote(JSON.stringify(docker.repoMounts))}\n`);
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
