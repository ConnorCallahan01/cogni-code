import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function importModule(name) {
  return import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
}

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

function write(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

// A graph repo shaped like the ones the old two-line .gitignore produced:
// knowledge and runtime state tracked side by side.
function makeLegacyGraphRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graph-git-"));
  const graphRoot = path.join(tmp, ".graph-memory");
  fs.mkdirSync(graphRoot);
  git(graphRoot, "init", "-q");
  git(graphRoot, "config", "user.name", "test");
  git(graphRoot, "config", "user.email", "test@example.com");
  write(graphRoot, ".gitignore", ".buffer/\n.deltas/\nmy-own-pattern\n");
  write(graphRoot, "nodes/patterns/kept.md", "---\ngist: kept\n---\n# kept\n");
  write(graphRoot, "MAP.md", "# MAP\n");
  write(graphRoot, ".jobs/done/scribe_1.json", "{}");
  write(graphRoot, ".pipeline-logs/scribe-1.log", "log");
  write(graphRoot, ".sessions/abc/capture.jsonl", "{\"raw\":\"conversation\"}");
  write(graphRoot, ".capture-debug.jsonl", "{}");
  git(graphRoot, "add", "-A");
  git(graphRoot, "commit", "-qm", "legacy");
  return { tmp, graphRoot };
}

test("graph repo hygiene untracks runtime state in one commit and keeps knowledge", async () => {
  const { tmp, graphRoot } = makeLegacyGraphRepo();
  try {
    process.env.GRAPH_MEMORY_ROOT = graphRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { ensureGraphGitHygiene, GRAPH_GITIGNORE_ENTRIES } = await importModule("git.js");

    // A pending knowledge edit must not ride along in the cleanup commit, even
    // when an interrupted worker left it (and new runtime files) staged.
    write(graphRoot, "nodes/patterns/kept.md", "---\ngist: kept\n---\n# kept, edited\n");
    write(graphRoot, ".jobs/done/scribe_staged.json", "{}");
    git(graphRoot, "add", "-A");

    const untracked = await ensureGraphGitHygiene();
    assert.equal(untracked, 4);

    const trackedNow = git(graphRoot, "ls-files").split("\n");
    assert.deepEqual(trackedNow.sort(), [".gitignore", "MAP.md", "nodes/patterns/kept.md"]);
    for (const rel of [".jobs/done/scribe_1.json", ".pipeline-logs/scribe-1.log", ".sessions/abc/capture.jsonl", ".capture-debug.jsonl"]) {
      assert.ok(fs.existsSync(path.join(graphRoot, rel)), `${rel} stays on disk`);
    }

    assert.match(git(graphRoot, "log", "-1", "--format=%s"), /stop tracking runtime state \(4 files\)/);
    assert.equal(git(graphRoot, "status", "--porcelain"), "M nodes/patterns/kept.md", "the edit is still pending, not committed");

    const gitignore = fs.readFileSync(path.join(graphRoot, ".gitignore"), "utf-8");
    assert.match(gitignore, /^my-own-pattern$/m, "user lines are preserved");
    for (const entry of GRAPH_GITIGNORE_ENTRIES) assert.ok(gitignore.split("\n").includes(entry), `${entry} present`);

    // What the worker prompts run next: new runtime files stay out, knowledge goes in.
    write(graphRoot, ".jobs/done/scribe_2.json", "{}");
    write(graphRoot, ".notion-webhook-token", "secret");
    write(graphRoot, ".env", "API_KEY=secret");
    write(graphRoot, "nodes/concepts/new.md", "# new\n");
    git(graphRoot, "add", "-A");
    assert.deepEqual(git(graphRoot, "diff", "--cached", "--name-only").split("\n").sort(), ["nodes/concepts/new.md", "nodes/patterns/kept.md"]);
    git(graphRoot, "commit", "-qm", "knowledge");

    // Idempotent: nothing left to untrack, no extra commit.
    const head = git(graphRoot, "rev-parse", "HEAD");
    assert.equal(await ensureGraphGitHygiene(), 0);
    assert.equal(git(graphRoot, "rev-parse", "HEAD"), head);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("graph repo hygiene does not create a repo where there is none", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graph-git-none-"));
  try {
    process.env.GRAPH_MEMORY_ROOT = tmp;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { ensureGraphGitHygiene } = await importModule("git.js");
    assert.equal(await ensureGraphGitHygiene(), 0);
    assert.equal(fs.existsSync(path.join(tmp, ".git")), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
