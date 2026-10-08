import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);

const MINUTE = 60 * 1000;

// Verbatim error lines from failed worker logs written while the host was
// asleep or offline (ANSI kept where the harness printed it).
const OPENCODE_OFFLINE_TAIL = "\x1b[0m\n> build · glm-5.3-flash\n\x1b[0m\n\x1b[91m\x1b[1mError: \x1b[0mCannot connect to API: Unable to connect. Is the computer able to access the url?\n";
const OPENCODE_DB_LOCKED_TAIL = "\x1b[91m\x1b[1mError: \x1b[0mUnexpected error\ndatabase is locked\n";
const CODEX_ROUTING_TAIL = [
  "ERROR: Reconnecting... 5/5",
  "ERROR: workspace routing discovery failed",
  "ERROR: workspace routing discovery failed",
].join("\n");
const CODEX_OFFLINE_TAIL = [
  "2026-09-30T00:58:25.845815Z ERROR codex_login::auth::manager: Failed to refresh token: error sending request for url (https://auth.openai.com/oauth/token)",
  "ERROR: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
].join("\n");
// A revoked login also produces network-looking lines; it is not transient.
const CODEX_REVOKED_TAIL = [
  "ERROR: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
  "2026-10-06T17:01:10.775931Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.",
  "ERROR: Your access token could not be refreshed. Please log out and sign in again.",
].join("\n");

test("worker-transient: classifies the harnesses' own offline and busy errors", async () => {
  const { detectTransientFailure } = await importModule("pipeline/worker-transient.js");
  assert.deepEqual(detectTransientFailure("opencode", OPENCODE_OFFLINE_TAIL), {
    kind: "network",
    evidence: "Error: Cannot connect to API: Unable to connect. Is the computer able to access the url?",
  });
  assert.equal(detectTransientFailure("opencode", OPENCODE_DB_LOCKED_TAIL)?.kind, "busy");
  assert.equal(detectTransientFailure("codex", CODEX_ROUTING_TAIL)?.kind, "network");
  assert.equal(detectTransientFailure("codex", CODEX_OFFLINE_TAIL)?.kind, "network");
  assert.equal(detectTransientFailure("codex", CODEX_REVOKED_TAIL), null, "rejected credentials are not transient");
  assert.equal(detectTransientFailure("codex", OPENCODE_OFFLINE_TAIL), null, "patterns are per harness");
  assert.equal(
    detectTransientFailure("opencode", "→ Read notes.md\nthe log said Error: Cannot connect to API: Unable to connect\nError: model refused\n"),
    null,
    "quoted text is not the harness reporting it"
  );
});

test("worker-transient: retry delay backs off from 2 to 30 minutes", async () => {
  const { transientRetryDelayMs } = await importModule("pipeline/worker-transient.js");
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map((n) => transientRetryDelayMs(n) / MINUTE), [2, 4, 8, 16, 30, 30, 30]);
});

// ── The daemon, end to end, with a fake opencode harness ───────────────────

const OPENCODE_BROKEN_TAIL = "Error: the model returned an invalid tool call\n";

function makeFakeOpencode(tmp) {
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir);
  const offline = path.join(tmp, "opencode-offline.txt");
  const broken = path.join(tmp, "opencode-broken.txt");
  fs.writeFileSync(offline, OPENCODE_OFFLINE_TAIL);
  fs.writeFileSync(broken, OPENCODE_BROKEN_TAIL);
  // `run` is a worker; `db` / `session` are the daemon's session pruner.
  fs.writeFileSync(path.join(binDir, "opencode"), `#!/bin/sh
case "$1" in
  db) echo "[]"; exit 0 ;;
  session) exit 0 ;;
esac
echo "$*" >> "$FAKE_CALLS"
case "$FAKE_OPENCODE" in
  offline) cat ${JSON.stringify(offline)}; exit 1 ;;
  *) cat ${JSON.stringify(broken)}; exit 1 ;;
esac
`, { mode: 0o755 });
  return binDir;
}

async function withDaemonGraph(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worker-transient-"));
  const graphRoot = path.join(tmp, ".graph-memory");
  const previousRoot = process.env.GRAPH_MEMORY_ROOT;
  try {
    process.env.GRAPH_MEMORY_ROOT = graphRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { initializeGraph } = await importModule("index.js");
    initializeGraph();
    const queue = await importModule("pipeline/job-queue.js");
    const binDir = makeFakeOpencode(tmp);
    const callsFile = path.join(tmp, "calls.txt");
    fs.writeFileSync(callsFile, "");

    const runDaemonOnce = (mode) => {
      execFileSync(process.execPath, [path.join(pluginDir, "dist/graph-memory/pipeline/daemon.js"), "--once"], {
        encoding: "utf-8",
        stdio: "pipe",
        env: {
          ...process.env,
          GRAPH_MEMORY_ROOT: graphRoot,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          GRAPH_MEMORY_WORKER_PROVIDER: "opencode",
          GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "",
          FAKE_OPENCODE: mode,
          FAKE_CALLS: callsFile,
        },
      });
    };
    const workerRuns = (needle) =>
      fs.readFileSync(callsFile, "utf-8").split("\n").filter((line) => line.includes(needle)).length;
    const jobFile = (state, job) => path.join(graphRoot, ".jobs", state, `${job.id}.json`);
    const readJob = (state, job) => JSON.parse(fs.readFileSync(jobFile(state, job), "utf-8"));
    const editQueued = (job, patch) =>
      fs.writeFileSync(jobFile("queued", job), JSON.stringify({ ...readJob("queued", job), ...patch }, null, 2));

    await fn({ graphRoot, queue, runDaemonOnce, workerRuns, jobFile, readJob, editQueued });
  } finally {
    if (previousRoot === undefined) delete process.env.GRAPH_MEMORY_ROOT;
    else process.env.GRAPH_MEMORY_ROOT = previousRoot;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("daemon: an offline scribe is deferred with a backoff and keeps its snapshot", async () => {
  const { TRANSIENT_DEFER_LIMIT } = await importModule("pipeline/worker-transient.js");
  await withDaemonGraph(async ({ graphRoot, queue, runDaemonOnce, workerRuns, jobFile, readJob, editQueued }) => {
    const snapshotPath = path.join(graphRoot, ".buffer", "snapshot_1.jsonl");
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, "{\"role\":\"user\",\"content\":\"hi\"}\n");
    // Old enough for the orphan sweep, which only spares snapshots a job holds.
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * MINUTE);
    fs.utimesSync(snapshotPath, fiveHoursAgo, fiveHoursAgo);
    const { job } = queue.enqueueJob({
      type: "scribe",
      payload: { snapshotPath, sessionId: "session-1" },
      triggerSource: "test",
      idempotencyKey: "scribe:session-1",
    });

    const before = Date.now();
    runDaemonOnce("offline");
    assert.equal(workerRuns("scribe"), 1);
    assert.equal(fs.existsSync(jobFile("failed", job)), false, "not failed");
    let queued = readJob("queued", job);
    assert.equal(queued.deferrals, 1);
    assert.equal(queued.attempt, 0, "a deferral doesn't spend an attempt");
    assert.match(queued.lastError, /unavailable \(network\): Error: Cannot connect to API/);
    const delay = Date.parse(queued.notBefore) - before;
    assert.ok(delay >= 2 * MINUTE && delay < 3 * MINUTE, `first retry ~2 min out (got ${delay}ms)`);

    // Not due yet: the next tick leaves it alone, and the snapshot survives the sweep.
    runDaemonOnce("offline");
    assert.equal(workerRuns("scribe"), 1, "not claimed before notBefore");
    assert.equal(readJob("queued", job).deferrals, 1);
    assert.ok(fs.existsSync(snapshotPath), "snapshot kept while the job waits");

    // Due and still offline: deferred again with a longer delay.
    editQueued(job, { notBefore: new Date(Date.now() - 1000).toISOString() });
    const second = Date.now();
    runDaemonOnce("offline");
    assert.equal(workerRuns("scribe"), 2);
    queued = readJob("queued", job);
    assert.equal(queued.deferrals, 2);
    assert.ok(Date.parse(queued.notBefore) - second >= 4 * MINUTE, "second retry ~4 min out");

    // Out of deferrals: the job fails for good.
    editQueued(job, { notBefore: new Date(Date.now() - 1000).toISOString(), deferrals: TRANSIENT_DEFER_LIMIT });
    runDaemonOnce("offline");
    assert.equal(workerRuns("scribe"), 3);
    assert.equal(fs.existsSync(jobFile("queued", job)), false);
    assert.match(readJob("failed", job).lastError, /unavailable \(network\)/);
  });
});

test("daemon: a genuine worker failure still fails the job", async () => {
  await withDaemonGraph(async ({ graphRoot, queue, runDaemonOnce, workerRuns, jobFile, readJob }) => {
    const snapshotPath = path.join(graphRoot, ".buffer", "snapshot_2.jsonl");
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, "{}\n");
    const { job } = queue.enqueueJob({
      type: "scribe",
      payload: { snapshotPath, sessionId: "session-2" },
      triggerSource: "test",
      idempotencyKey: "scribe:session-2",
    });

    runDaemonOnce("broken");
    assert.equal(workerRuns("scribe"), 1);
    assert.equal(fs.existsSync(jobFile("queued", job)), false);
    const failed = readJob("failed", job);
    assert.match(failed.lastError, /Scribe worker exited with code 1/);
    assert.equal(failed.deferrals, undefined);
  });
});

test("daemon: an offline auditor is deferred and releases its project chain lock", async () => {
  await withDaemonGraph(async ({ graphRoot, queue, runDaemonOnce, workerRuns, readJob }) => {
    const project = "acme/app";
    fs.mkdirSync(path.join(graphRoot, ".deltas"), { recursive: true });
    fs.writeFileSync(
      path.join(graphRoot, ".deltas", "delta_1.json"),
      JSON.stringify({ scribes: [{ deltas: [{ project, type: "create_node", path: "concepts/x" }] }] })
    );
    const { job } = queue.enqueueJob({
      type: "auditor",
      payload: { reason: "test", project },
      triggerSource: "test",
      idempotencyKey: `auditor:${project}:test`,
    });

    runDaemonOnce("offline");
    assert.equal(workerRuns("auditor"), 1);
    assert.equal(readJob("queued", job).deferrals, 1);
    const { getProjectLockPath } = await importModule("working-files.js");
    assert.equal(fs.existsSync(getProjectLockPath(project)), false, "chain lock released");
  });
});
