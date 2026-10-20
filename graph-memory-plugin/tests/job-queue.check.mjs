import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);

async function withQueue(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "job-queue-"));
  const previousRoot = process.env.GRAPH_MEMORY_ROOT;
  try {
    process.env.GRAPH_MEMORY_ROOT = path.join(tmp, ".graph-memory");
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const queue = await importModule("pipeline/job-queue.js");
    queue.ensureJobDirectories();
    await fn(queue);
  } finally {
    if (previousRoot === undefined) delete process.env.GRAPH_MEMORY_ROOT;
    else process.env.GRAPH_MEMORY_ROOT = previousRoot;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const enqueue = (queue, type, project, key) =>
  queue.enqueueJob({ type, payload: { reason: "test", project }, triggerSource: "test", idempotencyKey: key });

// The librarian→dreamer and auditor→librarian guards ask for an active job of
// project "global", but a global job's project reads back as null, so the guard
// never matched: every global librarian queued another dreamer, until eleven
// global dreamers held all six worker slots and the daily brief waited 8 hours.
test("a queued global job counts as active for project \"global\"", async () => {
  await withQueue(async (queue) => {
    assert.equal(queue.hasActiveJobForProject("dreamer", "global"), false);

    enqueue(queue, "dreamer", undefined, "dreamer:global:1");
    assert.equal(queue.hasActiveJobForProject("dreamer", "global"), true, "no project is global");
    assert.equal(queue.hasActiveJobForProject("dreamer", "owner/a"), false, "a global job isn't a project's");
    assert.equal(queue.hasActiveJobForProject("librarian", "global"), false, "the type still has to match");

    enqueue(queue, "librarian", "global", "librarian:global:1");
    assert.equal(queue.hasActiveJobForProject("librarian", "global"), true, "an explicit \"global\" is global");

    enqueue(queue, "dreamer", "owner/a", "dreamer:owner/a:1");
    assert.equal(queue.hasActiveJobForProject("dreamer", "owner/a"), true);
    assert.equal(queue.hasActiveJobForProject("dreamer", "owner/b"), false);

    assert.equal(queue.listJobsForProject("queued", "global").length, 2, "both global jobs, not the project one");
  });
});
