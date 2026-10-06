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

// Verbatim tail of a codex worker log whose ChatGPT refresh token had been
// revoked (the host CLI refreshed a copied login first).
const CODEX_REVOKED_TAIL = [
  "2026-10-06T17:01:10.764028Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses",
  "2026-10-06T17:01:10.775931Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.",
  "ERROR: Your access token could not be refreshed. Please log out and sign in again.",
  "2026-10-06T17:01:10.995144Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.",
].join("\n");

// Verbatim tail of a codex worker that lost the network (host asleep) — a
// transient failure that must not be recorded as rejected credentials.
const CODEX_OFFLINE_TAIL = [
  "2026-09-30T00:58:25.845815Z ERROR codex_login::auth::manager: Failed to refresh token: error sending request for url (https://auth.openai.com/oauth/token)",
  "ERROR: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
  "2026-09-30T00:58:29.848801Z ERROR codex_login::auth::manager: Failed to refresh token: error sending request for url (https://auth.openai.com/oauth/token)",
].join("\n");

test("worker-auth: detects revoked codex credentials from the harness's own error lines", async () => {
  const { detectAuthRejection } = await importModule("pipeline/worker-auth.js");

  assert.match(detectAuthRejection("codex", CODEX_REVOKED_TAIL), /could not be refreshed|401 Unauthorized/);
  assert.equal(detectAuthRejection("codex", CODEX_OFFLINE_TAIL), null);
  assert.equal(
    detectAuthRejection("codex", "The API returned 401 Unauthorized and said your access token could not be refreshed."),
    null,
    "prose that merely mentions the failure is not the harness reporting it"
  );
  assert.equal(detectAuthRejection("opencode", CODEX_REVOKED_TAIL), null);
});

test("worker-auth: only the log tail is scanned", async () => {
  const { detectAuthRejection, readLogTail } = await importModule("pipeline/worker-auth.js");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worker-auth-tail-"));
  try {
    const logFile = path.join(tmp, "scribe-codex.log");
    // A worker that quoted the error early (e.g. while reading a session
    // snapshot) and then failed for an unrelated reason.
    fs.writeFileSync(logFile, `${CODEX_REVOKED_TAIL}\n${"tool output line\n".repeat(400)}ERROR: unrelated failure\n`);
    assert.equal(detectAuthRejection("codex", readLogTail(logFile)), null);

    fs.appendFileSync(logFile, `${CODEX_REVOKED_TAIL}\n`);
    assert.notEqual(detectAuthRejection("codex", readLogTail(logFile)), null);
    assert.equal(readLogTail(path.join(tmp, "missing.log")), "");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("worker-auth: rejection record, freshness window, and clear", async () => {
  const mod = await importModule("pipeline/worker-auth.js");
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worker-auth-state-"));
  try {
    assert.equal(mod.readAuthRejection(graphRoot, "codex"), null);

    const detectedAt = "2026-10-06T17:00:00.000Z";
    mod.recordAuthRejection(graphRoot, "codex", { detectedAt, logFile: "/x.log", evidence: "e" });
    mod.recordAuthRejection(graphRoot, "pi", { detectedAt, logFile: "/y.log", evidence: "e" });
    const rejection = mod.readAuthRejection(graphRoot, "codex");
    assert.equal(rejection.logFile, "/x.log");

    const t0 = Date.parse(detectedAt);
    assert.equal(mod.isAuthRejectionFresh(rejection, t0 + mod.AUTH_REJECTION_SKIP_MS - 1), true);
    assert.equal(mod.isAuthRejectionFresh(rejection, t0 + mod.AUTH_REJECTION_SKIP_MS), false);

    mod.clearAuthRejection(graphRoot, "codex");
    assert.equal(mod.readAuthRejection(graphRoot, "codex"), null);
    assert.notEqual(mod.readAuthRejection(graphRoot, "pi"), null, "clearing one harness keeps the others");

    mod.clearAuthRejection(graphRoot, "pi");
    assert.equal(fs.existsSync(mod.workerAuthStatePath(graphRoot)), false, "empty state removes the file");
  } finally {
    fs.rmSync(graphRoot, { recursive: true, force: true });
  }
});

// ── runPipelineWorker with fake harness binaries ────────────────────────────

function makeFakeHarnesses(tmp) {
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir);
  const revoked = path.join(tmp, "codex-revoked.txt");
  const offline = path.join(tmp, "codex-offline.txt");
  fs.writeFileSync(revoked, CODEX_REVOKED_TAIL + "\n");
  fs.writeFileSync(offline, CODEX_OFFLINE_TAIL + "\n");
  fs.writeFileSync(path.join(binDir, "codex"), `#!/bin/sh
echo codex >> "$FAKE_CALLS"
case "$FAKE_CODEX" in
  revoked) cat ${JSON.stringify(revoked)}; exit 1 ;;
  offline) cat ${JSON.stringify(offline)}; exit 1 ;;
  *) echo "codex ok"; exit 0 ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(binDir, "pi"), `#!/bin/sh
echo pi >> "$FAKE_CALLS"
echo "pi exit $FAKE_PI_EXIT"
exit "\${FAKE_PI_EXIT:-0}"
`, { mode: 0o755 });
  return binDir;
}

function runWorker(tmp, graphRoot, binDir, env) {
  const callsFile = path.join(tmp, `calls-${Date.now()}-${Math.random()}.txt`);
  fs.writeFileSync(callsFile, "");
  const configUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/config.js")).href;
  const runnerUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/pipeline/worker-runner.js")).href;
  const out = execFileSync(process.execPath, [
    "--input-type=module", "-e",
    `
      const { reloadConfig } = await import(${JSON.stringify(configUrl)});
      reloadConfig();
      const { runPipelineWorker } = await import(${JSON.stringify(runnerUrl)});
      let result;
      try {
        result = await runPipelineWorker({
          name: "scribe-test",
          prompt: "test",
          logDir: ${JSON.stringify(path.join(graphRoot, ".pipeline-logs"))},
          graphRoot: ${JSON.stringify(graphRoot)},
          timeoutMs: 30000,
        });
      } catch (err) {
        result = { threw: err.message };
      }
      process.stdout.write(JSON.stringify(result));
    `,
  ], {
    encoding: "utf-8",
    env: {
      ...process.env,
      GRAPH_MEMORY_ROOT: graphRoot,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      FAKE_CALLS: callsFile,
      GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "",
      ...env,
    },
  });
  const calls = fs.readFileSync(callsFile, "utf-8").trim().split("\n").filter(Boolean);
  return { result: JSON.parse(out), calls };
}

test("runPipelineWorker: a rejected codex login is recorded, skipped as a fallback, and cleared on success", async () => {
  const { readAuthRejection } = await importModule("pipeline/worker-auth.js");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worker-auth-run-"));
  const graphRoot = path.join(tmp, ".graph-memory");
  fs.mkdirSync(path.join(graphRoot, ".jobs"), { recursive: true });
  const binDir = makeFakeHarnesses(tmp);
  try {
    // 1. Primary codex is revoked → fails, rejection recorded, fallback pi runs.
    let run = runWorker(tmp, graphRoot, binDir, {
      GRAPH_MEMORY_WORKER_PROVIDER: "codex", GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "pi", FAKE_CODEX: "revoked",
    });
    assert.deepEqual(run.calls, ["codex", "pi"]);
    assert.equal(run.result.exitCode, 0);
    const rejection = readAuthRejection(graphRoot, "codex");
    assert.ok(rejection, "rejection recorded");
    assert.match(fs.readFileSync(rejection.logFile, "utf-8"), /\[graph-memory\] codex credentials were rejected/);

    // 2. While the rejection is fresh, codex is skipped and pi runs directly.
    run = runWorker(tmp, graphRoot, binDir, {
      GRAPH_MEMORY_WORKER_PROVIDER: "codex", GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "pi", FAKE_CODEX: "revoked",
    });
    assert.deepEqual(run.calls, ["pi"]);
    assert.equal(run.result.exitCode, 0);

    // 3. Primary pi fails → codex fallback is skipped; pi's failure is returned.
    run = runWorker(tmp, graphRoot, binDir, {
      GRAPH_MEMORY_WORKER_PROVIDER: "pi", GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "codex", FAKE_PI_EXIT: "1", FAKE_CODEX: "revoked",
    });
    assert.deepEqual(run.calls, ["pi"]);
    assert.equal(run.result.exitCode, 1);
    assert.match(run.result.logFile, /-pi-/);

    // 4. Codex as the only harness still runs — a job is never failed untried.
    run = runWorker(tmp, graphRoot, binDir, { GRAPH_MEMORY_WORKER_PROVIDER: "codex", FAKE_CODEX: "revoked" });
    assert.deepEqual(run.calls, ["codex"]);
    assert.equal(run.result.exitCode, 1);

    // 5. After re-login, the next codex success clears the rejection.
    run = runWorker(tmp, graphRoot, binDir, { GRAPH_MEMORY_WORKER_PROVIDER: "codex", FAKE_CODEX: "ok" });
    assert.deepEqual(run.calls, ["codex"]);
    assert.equal(run.result.exitCode, 0);
    assert.equal(readAuthRejection(graphRoot, "codex"), null);

    // 6. A network failure is transient: nothing recorded, fallback still tried.
    run = runWorker(tmp, graphRoot, binDir, {
      GRAPH_MEMORY_WORKER_PROVIDER: "pi", GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "codex", FAKE_PI_EXIT: "1", FAKE_CODEX: "offline",
    });
    assert.deepEqual(run.calls, ["pi", "codex"]);
    assert.equal(run.result.exitCode, 1);
    assert.equal(readAuthRejection(graphRoot, "codex"), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
