import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const dockerfile = fs.readFileSync(path.join(pluginDir, "docker", "Dockerfile"), "utf-8");

const committingPrompts = fs
  .readdirSync(path.join(pluginDir, "agents"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(pluginDir, "agents", f), "utf-8") }))
  .filter((p) => /git add -A && git commit/.test(p.text));

// The image never had git while four prompts ended in `git commit`: the graph
// went a month without a commit, and opencode workers burned their timeout
// trying to install a substitute before falling back to a second harness.
test("the daemon image can commit the graph the prompts tell workers to commit", () => {
  assert.ok(committingPrompts.length > 0, "expected agent prompts that commit the graph");

  const aptInstall = dockerfile.match(/apt-get install[^\n]*/)?.[0] ?? "";
  assert.match(aptInstall, /\bgit\b/, "Dockerfile must install git");

  const graphRoot = dockerfile.match(/^ENV GRAPH_MEMORY_ROOT=(\S+)/m)?.[1];
  assert.ok(graphRoot, "Dockerfile sets GRAPH_MEMORY_ROOT");
  assert.ok(
    dockerfile.includes(`git config --system --add safe.directory ${graphRoot}`),
    `the bind-mounted graph root (${graphRoot}) must be a safe.directory`
  );
  assert.match(dockerfile, /git config --system user\.name /);
  assert.match(dockerfile, /git config --system user\.email /);
});

test("prompts that commit the graph don't let a failed commit eat the worker's timeout", () => {
  for (const { name, text } of committingPrompts) {
    assert.match(text, /If the commit fails[^\n]*Do not install git or a substitute/, `${name} needs the failed-commit guard`);
  }
});
