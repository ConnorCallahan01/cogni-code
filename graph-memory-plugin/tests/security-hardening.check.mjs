import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
const runtimeCli = path.join(pluginDir, "dist/graph-memory/runtime-cli.js");
const cli = path.join(pluginDir, "dist/graph-memory/cli.js");

// config.ts fixes the pointer file's path from HOME when first imported, so
// this file's own HOME is a throwaway one: a regression that writes the
// pointer can't reach the developer's real ~/.graph-memory-config.yml.
const fileHome = fs.mkdtempSync(path.join(os.tmpdir(), "security-home-"));
process.env.HOME = fileHome;
process.env.USERPROFILE = fileHome;
process.on("exit", () => fs.rmSync(fileHome, { recursive: true, force: true }));

function sandbox(prefix, base = os.tmpdir()) {
  const tmp = fs.mkdtempSync(path.join(base, prefix));
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  return { tmp, home };
}

function childEnv(home, graphRoot) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  if (graphRoot) env.GRAPH_MEMORY_ROOT = graphRoot;
  else delete env.GRAPH_MEMORY_ROOT;
  return env;
}

// What every bin/docker-*.sh does first: eval runtime-env's output, then use
// the variables.
function evalDockerEnv({ cwd, home, graphRoot }, names) {
  const script = `eval "$('${process.execPath}' '${runtimeCli}' docker-env)"; printf '%s\\0' ${names.map((name) => `"$${name}"`).join(" ")}`;
  const result = spawnSync("bash", ["-c", script], { cwd, env: childEnv(home, graphRoot), encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
  return { values: result.stdout.split("\0").slice(0, names.length), stderr: result.stderr };
}

// The runtime file sits in the graph root, which a container worker can write,
// and the docker scripts eval its values. JSON.stringify quoting left $(...)
// and backticks live, so one edited field ran on the host as the user.
test("a poisoned runtime config runs nothing when the docker scripts eval it", () => {
  const { tmp, home } = sandbox("runtime-eval-");
  try {
    const graphRoot = path.join(tmp, "graph");
    fs.mkdirSync(graphRoot);
    const marker = (n) => path.join(tmp, `pwned-${n}`);
    fs.writeFileSync(path.join(graphRoot, ".runtime-config.json"), JSON.stringify({
      mode: "docker",
      graphRoot: home,
      docker: {
        workerProvider: "opencode",
        image: `graph-memory-daemon:local$(touch ${marker(1)})`,
        containerName: `daemon\`touch ${marker(2)}\``,
        authVolume: home,
        memoryLimit: `6g"; touch ${marker(3)}; "`,
        cpuLimit: "6.0",
        graphRootInContainer: "/graph-memory",
        authPathInContainer: "/graph-memory-auth",
      },
    }));

    const { values, stderr } = evalDockerEnv({ cwd: tmp, home, graphRoot }, [
      "GRAPH_MEMORY_DOCKER_IMAGE",
      "GRAPH_MEMORY_DOCKER_CONTAINER",
      "GRAPH_MEMORY_DOCKER_AUTH_VOLUME",
      "GRAPH_MEMORY_MEMORY_LIMIT",
      "GRAPH_MEMORY_HOST_ROOT",
    ]);

    for (const n of [1, 2, 3]) assert.equal(fs.existsSync(marker(n)), false, `payload ${n} ran`);
    assert.deepEqual(values, [
      "graph-memory-daemon:local",
      "graph-memory-daemon-home",
      "graph-memory-auth-home",
      "6g",
      graphRoot,
    ], "each bad value falls back to its default, and the mounted root is the host's own, not the file's");
    for (const field of ["image", "containerName", "authVolume", "memoryLimit"]) {
      assert.match(stderr, new RegExp(`ignoring invalid docker\\.${field}`), `the ${field} fallback is announced`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("a graph root with shell characters in its name reaches the docker scripts intact", () => {
  const { tmp, home } = sandbox("runtime-quote-");
  try {
    const graphRoot = path.join(tmp, `gm $(touch pwned-sub) \`touch pwned-tick\` 'single' "double" \\back`);
    fs.mkdirSync(graphRoot);
    const { values } = evalDockerEnv({ cwd: tmp, home, graphRoot }, ["GRAPH_MEMORY_HOST_ROOT"]);
    assert.equal(values[0], graphRoot);
    assert.equal(fs.existsSync(path.join(tmp, "pwned-sub")), false);
    assert.equal(fs.existsSync(path.join(tmp, "pwned-tick")), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("saving the runtime config refuses values outside their shape and keeps real ones", async () => {
  const { tmp } = sandbox("runtime-save-");
  const previousRoot = process.env.GRAPH_MEMORY_ROOT;
  try {
    process.env.GRAPH_MEMORY_ROOT = path.join(tmp, "graph");
    fs.mkdirSync(process.env.GRAPH_MEMORY_ROOT);
    const { CONFIG, reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { saveRuntimeConfig, loadRuntimeConfig } = await importModule("runtime.js");

    const real = {
      image: "ghcr.io/acme/graph-memory@sha256:0123abcd",
      containerName: "gm-daemon_1",
      authVolume: "gm-auth.v2",
      memoryLimit: "8g",
      cpuLimit: "4.5",
      workerProvider: "opencode",
      workerModel: "zai-coding-plan/glm-5.3-flash",
      fallbackProvider: "codex",
    };
    saveRuntimeConfig({ mode: "docker", docker: real });
    const loaded = loadRuntimeConfig();
    for (const [field, value] of Object.entries(real)) assert.equal(loaded.docker[field], value, field);

    const before = fs.readFileSync(CONFIG.paths.runtimeConfig, "utf-8");
    for (const docker of [
      { image: "graph-memory-daemon:local$(id)" },
      { containerName: "daemon;id" },
      { authVolume: "/Users/someone" },
      { graphRootInContainer: "/graph-memory/../etc" },
      { memoryLimit: "6g`id`" },
      { cpuLimit: "6 --privileged" },
      { workerProvider: "sh" },
      { fallbackProvider: "bash" },
    ]) {
      assert.throws(() => saveRuntimeConfig({ docker }), /Invalid runtime config: docker\./, JSON.stringify(docker));
    }
    assert.throws(() => saveRuntimeConfig({ mode: "root" }), /Invalid runtime config: mode/);
    assert.equal(fs.readFileSync(CONFIG.paths.runtimeConfig, "utf-8"), before, "a refused save writes nothing");
  } finally {
    if (previousRoot === undefined) delete process.env.GRAPH_MEMORY_ROOT;
    else process.env.GRAPH_MEMORY_ROOT = previousRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Users let graph_memory run without a prompt because recall and remember are
// its everyday work. These actions rode along: a model steered by text it read
// could re-point every later session at a directory it chose, rewrite the
// runtime the docker scripts eval, or overwrite an instruction file anywhere.
test("graph_memory can't re-point storage, change the runtime, write instruction files, or reach Notion", async () => {
  const { tmp } = sandbox("tool-admin-");
  const previousRoot = process.env.GRAPH_MEMORY_ROOT;
  try {
    process.env.GRAPH_MEMORY_ROOT = path.join(tmp, "graph");
    const { CONFIG, reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { initializeGraph } = await importModule("index.js");
    initializeGraph();
    const { handleGraphMemory, graphMemorySchema } = await importModule("tools.js");

    const projectDir = path.join(tmp, "repo");
    fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });
    const elsewhere = path.join(tmp, "elsewhere");
    const runtimeBefore = fs.existsSync(CONFIG.paths.runtimeConfig) ? fs.readFileSync(CONFIG.paths.runtimeConfig, "utf-8") : null;

    const removed = ["initialize", "configure_runtime", "bootstrap", "notion_setup", "notion_sync", "notion_consolidate", "notion_create_task"];
    for (const action of removed) {
      assert.equal(graphMemorySchema.action.safeParse(action).success, false, `${action} is still in the tool schema`);
      const result = await handleGraphMemory({
        action,
        graphRoot: elsewhere,
        runtimeMode: "docker",
        imageName: "graph-memory-daemon:local$(id)",
        project: "owner/repo",
        harness: "claude-code",
        cwd: projectDir,
      });
      assert.equal(result.isError, true, action);
      assert.match(result.content[0].text, /^Unknown action/, action);
    }

    assert.equal(fs.existsSync(elsewhere), false, "no graph was created elsewhere");
    assert.equal(fs.existsSync(path.join(fileHome, ".graph-memory-config.yml")), false, "the storage pointer wasn't rewritten");
    assert.equal(fs.existsSync(path.join(projectDir, "CLAUDE.md")), false);
    assert.equal(fs.existsSync(path.join(projectDir, ".claude", "CLAUDE.md")), false);
    const runtimeAfter = fs.existsSync(CONFIG.paths.runtimeConfig) ? fs.readFileSync(CONFIG.paths.runtimeConfig, "utf-8") : null;
    assert.equal(runtimeAfter, runtimeBefore, "the runtime config wasn't touched");
  } finally {
    if (previousRoot === undefined) delete process.env.GRAPH_MEMORY_ROOT;
    else process.env.GRAPH_MEMORY_ROOT = previousRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("cogni-code configure-runtime sets workers from the command line and refuses bad values", () => {
  const { tmp, home } = sandbox("cli-runtime-");
  try {
    const graphRoot = path.join(tmp, "graph");
    fs.mkdirSync(graphRoot);
    const file = path.join(graphRoot, ".runtime-config.json");
    const run = (...args) => spawnSync(process.execPath, [cli, "configure-runtime", ...args], { env: childEnv(home, graphRoot), encoding: "utf-8" });

    const set = run("--mode", "docker", "--worker", "opencode", "--fallback", "codex", "--fallback-model", "gpt-5");
    assert.equal(set.status, 0, set.stderr);
    assert.equal(JSON.parse(set.stdout).runtime.docker.workerProvider, "opencode");
    let saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    assert.equal(saved.mode, "docker");
    assert.equal(saved.docker.fallbackProvider, "codex");
    assert.equal(saved.docker.fallbackModel, "gpt-5");

    const cleared = run("--fallback", "none");
    assert.equal(cleared.status, 0, cleared.stderr);
    saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    assert.equal(saved.mode, "docker", "the mode is kept when --mode is left out");
    assert.equal(saved.docker.fallbackProvider, undefined);
    assert.equal(saved.docker.fallbackModel, undefined);

    const before = fs.readFileSync(file, "utf-8");
    const bad = run("--worker", "sh");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Invalid runtime config: docker\.workerProvider/);
    assert.equal(fs.readFileSync(file, "utf-8"), before, "a refused value writes nothing");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("cogni-code init points memory at a new root from the command line, never a system path", () => {
  // init refuses anything under /var, which is where macOS puts os.tmpdir().
  const { tmp, home } = sandbox("cli-init-", process.platform === "win32" ? os.tmpdir() : fs.realpathSync("/tmp"));
  try {
    const root = path.join(tmp, "my graph");
    const pointer = path.join(home, ".graph-memory-config.yml");
    const init = (graphRoot) => spawnSync(process.execPath, [cli, "init", "--graph-root", graphRoot], { env: childEnv(home), encoding: "utf-8" });

    const ok = init(root);
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(fs.readFileSync(pointer, "utf-8").includes(root), "the pointer names the new root");
    assert.ok(fs.existsSync(path.join(root, "MAP.md")), "the graph was created");

    const before = fs.readFileSync(pointer, "utf-8");
    const refused = init("/etc/graph-memory");
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /refusing to initialize graph at system path/);
    assert.equal(fs.readFileSync(pointer, "utf-8"), before);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// The Notion webhook was the package's only network listener, and the docker
// scripts published its port on every interface.
test("the package opens no network port", () => {
  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) sources.push(full);
    }
  };
  walk(path.join(pluginDir, "src"));
  walk(path.join(pluginDir, "extensions"));
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf-8");
    assert.doesNotMatch(text, /\bcreateServer\s*\(|\.listen\s*\(/, `${path.relative(pluginDir, file)} opens a listener`);
  }
  for (const script of ["bin/docker-start.sh", "bin/docker-bootstrap.sh"]) {
    const text = fs.readFileSync(path.join(pluginDir, script), "utf-8");
    assert.doesNotMatch(text, /^\s*(-p|--publish)[\s=]/m, `${script} publishes a port`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(pluginDir, "docker/Dockerfile"), "utf-8"), /^EXPOSE/m);
});
