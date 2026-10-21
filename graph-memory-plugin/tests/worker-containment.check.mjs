import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
const readText = (rel) => fs.readFileSync(path.join(pluginDir, rel), "utf-8");

// Runs bin/docker-start.sh against a stub `docker` that records the arguments
// of `docker run`, so the container's flags are checked without an engine.
function dockerStartArgs(graphRoot) {
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-stub-"));
  const runArgs = path.join(stubDir, "run-args");
  fs.writeFileSync(path.join(stubDir, "docker"), `#!/bin/sh
if [ "$1" = "run" ]; then shift; printf '%s\\n' "$@" > "${runArgs}"; fi
exit 0
`, { mode: 0o755 });
  try {
    const env = { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH}`, GRAPH_MEMORY_ROOT: graphRoot, TZ: "UTC" };
    const result = spawnSync("bash", [path.join(pluginDir, "bin/docker-start.sh")], { env, encoding: "utf-8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return fs.readFileSync(runArgs, "utf-8").trim().split("\n");
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}

function dockerGraph(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const graphRoot = path.join(tmp, "graph");
  fs.mkdirSync(graphRoot);
  fs.writeFileSync(path.join(graphRoot, ".runtime-config.json"), JSON.stringify({ mode: "docker", docker: { workerProvider: "opencode" } }));
  return { tmp, graphRoot };
}

const valuesAfter = (args, flag) => args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));

// Workers run with their harness's permission checks off and can write the
// graph. The runtime config the docker scripts eval, the pipeline's .env, and
// the graph's git config and hooks sat in that same writable mount, and the
// image itself was writable by root.
test("the daemon container mounts what steers the host read-only, on a read-only image with two capabilities", () => {
  const { tmp, graphRoot } = dockerGraph("containment-");
  try {
    fs.mkdirSync(path.join(graphRoot, ".git", "hooks"), { recursive: true });
    fs.writeFileSync(path.join(graphRoot, ".git", "config"), "[core]\n");
    const args = dockerStartArgs(graphRoot);

    assert.ok(args.includes("--read-only"), "the image is read-only");
    assert.deepEqual(valuesAfter(args, "--cap-drop"), ["ALL"]);
    assert.deepEqual(valuesAfter(args, "--cap-add").sort(), ["DAC_OVERRIDE", "FOWNER"]);
    assert.deepEqual(valuesAfter(args, "--security-opt"), ["no-new-privileges"]);
    assert.ok(!args.includes("-p") && !args.includes("--publish"), "no port is published");

    const mounts = valuesAfter(args, "-v");
    for (const rel of [".runtime-config.json", ".env", ".git/config", ".git/hooks"]) {
      assert.ok(mounts.includes(`${graphRoot}/${rel}:/graph-memory/${rel}:ro`), `${rel} is read-only in the container`);
    }
    assert.ok(mounts.includes(`${graphRoot}:/graph-memory`), "the graph itself stays writable");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Left absent, the .env could be created by a worker and point the next
// worker's provider at an endpoint of its choosing.
test("an absent pipeline .env is created empty and private before the container starts", { skip: process.platform === "win32" }, () => {
  const { tmp, graphRoot } = dockerGraph("containment-env-");
  try {
    const args = dockerStartArgs(graphRoot);
    const envFile = path.join(graphRoot, ".env");
    assert.equal(fs.readFileSync(envFile, "utf-8"), "");
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
    const mounts = valuesAfter(args, "-v");
    assert.ok(mounts.includes(`${graphRoot}/.env:/graph-memory/.env:ro`));
    assert.ok(!mounts.some((mount) => mount.includes("/.git/")), "nothing is mounted for a .git that doesn't exist");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("bootstrap starts the container through docker-start.sh, so the flags live in one place", () => {
  const bootstrap = readText("bin/docker-bootstrap.sh");
  assert.match(bootstrap, /"\$DIR\/bin\/docker-start\.sh"/);
  assert.doesNotMatch(bootstrap, /docker run -d/);
});

test("the graph's own git runs no hook or fsmonitor command planted in its .git", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graph-git-hooks-"));
  const previousRoot = process.env.GRAPH_MEMORY_ROOT;
  try {
    const graphRoot = path.join(tmp, "graph");
    fs.mkdirSync(path.join(graphRoot, "nodes", "patterns"), { recursive: true });
    const git = (...args) => execFileSync("git", args, { cwd: graphRoot, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.name", "test");
    git("config", "user.email", "test@example.com");

    process.env.GRAPH_MEMORY_ROOT = graphRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { autoCommit, findGitTampering, listCommits } = await importModule("git.js");
    assert.deepEqual(findGitTampering(), [], "a fresh repo has nothing to report");

    const marker = (name) => path.join(tmp, `${name}-ran`);
    fs.writeFileSync(path.join(graphRoot, ".git", "hooks", "pre-commit"), `#!/bin/sh\ntouch "${marker("hook")}"\n`, { mode: 0o755 });
    fs.appendFileSync(path.join(graphRoot, ".git", "config"), `[core]\n\tfsmonitor = touch "${marker("fsmonitor")}"; false\n[alias]\n\tst = status\n`);
    fs.writeFileSync(path.join(graphRoot, "nodes", "patterns", "x.md"), "---\ngist: x\n---\n# x\n");

    await autoCommit("planted hooks");
    assert.equal(fs.existsSync(marker("hook")), false, "the pre-commit hook ran");
    assert.equal(fs.existsSync(marker("fsmonitor")), false, "the fsmonitor command ran");
    assert.equal((await listCommits(5)).length, 1, "the commit still landed");
    assert.deepEqual(findGitTampering().sort(), [".git/config alias.st", ".git/config core.fsmonitor", ".git/hooks/pre-commit"]);
  } finally {
    if (previousRoot === undefined) delete process.env.GRAPH_MEMORY_ROOT;
    else process.env.GRAPH_MEMORY_ROOT = previousRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the image is pinned: base by digest, packages from the lockfile, opencode by checksum", () => {
  const dockerfile = readText("docker/Dockerfile");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /^COPY package\.json npm-shrinkwrap\.json \.\/$/m);
  assert.match(dockerfile, /^RUN npm ci --omit=dev/m);
  assert.doesNotMatch(dockerfile, /npm install/);
  assert.match(dockerfile, /sha256sum -c -/);
  assert.match(dockerfile, /ARG OPENCODE_SHA256_ARM64=[0-9a-f]{64}/);
  assert.match(dockerfile, /ARG OPENCODE_SHA256_X64=[0-9a-f]{64}/);
  assert.match(dockerfile, /x86_64\) ASSET=x64/, "opencode's x86_64 asset is named x64");
  assert.doesNotMatch(dockerfile, /curl[^\n]*\|\s*(ba)?sh/, "nothing is piped from the network into a shell");
});

test("credential imports copy only what the harness needs, through the daemon image", () => {
  for (const script of ["bin/docker-opencode-import-host-auth.sh", "bin/docker-pi-import-host-auth.sh", "bin/docker-bootstrap.sh"]) {
    const text = readText(script);
    assert.doesNotMatch(text, /\balpine\b/, `${script} pulls an unpinned image`);
    assert.doesNotMatch(text, /\/tmp\/opencode-container-config\.json/, `${script} writes a fixed temp path`);
  }
  assert.doesNotMatch(readText("bin/docker-opencode-import-host-auth.sh"), /cp -r \/host-opencode-config/, "the whole host opencode config directory is copied");
  assert.doesNotMatch(readText("bin/docker-pi-import-host-auth.sh"), /cp -r \/host-pi\b/, "the whole ~/.pi, sessions included, is copied");
});

// 4.2.0's image copied package-lock.json, which npm never publishes, so
// docker-build.sh failed for everyone who installed from npm; building from a
// clone, which has the file, hid it.
test("every file the image copies is in the npm package", () => {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pluginDir, encoding: "utf-8" }))[0].files.map((file) => file.path);
  const sources = readText("docker/Dockerfile")
    .split("\n")
    .filter((line) => /^COPY\s/.test(line) && !/--from/.test(line))
    .flatMap((line) => line.trim().split(/\s+/).slice(1, -1));
  assert.ok(sources.length > 5, "found the COPY lines");
  for (const source of sources) {
    const clean = source.replace(/\/$/, "");
    assert.ok(packed.some((file) => file === clean || file.startsWith(`${clean}/`)), `${source} is copied into the image but npm doesn't publish it`);
  }
});

// npm installs every file with the same 1985 timestamp, and the build-context
// transfer skips a file whose size and timestamp it has already seen, even with
// --no-cache: an upgraded package.json that kept its size reached the image as
// the previous version's.
test("docker-build.sh sends the build a freshly stamped copy of the package", () => {
  const { tmp, graphRoot } = dockerGraph("fresh-context-");
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-stub-"));
  const log = path.join(stubDir, "build");
  fs.writeFileSync(path.join(stubDir, "docker"), `#!/bin/sh
if [ "$1" = "build" ]; then
  for last; do :; done
  node -e 'const fs = require("fs"); const [ctx, args] = process.argv.slice(1); fs.writeFileSync(process.env.BUILD_LOG, JSON.stringify({ ctx, args, mtime: fs.statSync(ctx + "/package.json").mtimeMs, pkg: fs.readFileSync(ctx + "/package.json", "utf-8"), nodeModules: fs.existsSync(ctx + "/node_modules") }))' "$last" "$*"
fi
exit 0
`, { mode: 0o755 });
  try {
    const started = Date.now();
    const env = { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH}`, GRAPH_MEMORY_ROOT: graphRoot, BUILD_LOG: log };
    const result = spawnSync("bash", [path.join(pluginDir, "bin/docker-build.sh"), "--quiet"], { env, encoding: "utf-8" });
    assert.equal(result.status, 0, result.stderr);
    const build = JSON.parse(fs.readFileSync(log, "utf-8"));

    assert.notEqual(path.resolve(build.ctx), pluginDir, "the build reads a copy, not the package directory");
    assert.ok(build.mtime >= started - 2000, "the copy's files are stamped now");
    assert.equal(build.pkg, readText("package.json"), "with the package's own contents");
    assert.equal(build.nodeModules, false, "node_modules stays out of the context");
    assert.ok(build.args.includes(`-f ${build.ctx}/docker/Dockerfile`), "the Dockerfile comes from the same copy");
    assert.ok(build.args.includes("--quiet"), "extra arguments reach docker build");
    assert.equal(fs.existsSync(build.ctx), false, "the copy is removed afterwards");
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("bootstrap builds the image through docker-build.sh", () => {
  const bootstrap = readText("bin/docker-bootstrap.sh");
  assert.match(bootstrap, /"\$DIR\/bin\/docker-build\.sh"/);
  assert.doesNotMatch(bootstrap, /docker build /);
});
