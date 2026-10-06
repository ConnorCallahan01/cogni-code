import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const runnerUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/pipeline/worker-runner.js")).href;

test("opencode worker config turns snapshots off and keeps an existing inline config", async () => {
  const { opencodeWorkerConfig } = await import(runnerUrl);
  assert.deepEqual(JSON.parse(opencodeWorkerConfig(undefined)), { snapshot: false });
  assert.deepEqual(JSON.parse(opencodeWorkerConfig('{"model":"zai/x"}')), { snapshot: false, model: "zai/x" });
  assert.deepEqual(JSON.parse(opencodeWorkerConfig('{"snapshot":true}')), { snapshot: true }, "an explicit choice wins");
  assert.equal(opencodeWorkerConfig("not json"), "not json", "unparseable values pass through untouched");
});

// opencode's snapshot diffs of the graph root grew its session database to 64 GB.
test("opencode workers are launched with snapshot tracking off", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-worker-"));
  try {
    const graphRoot = path.join(tmp, ".graph-memory");
    fs.mkdirSync(path.join(graphRoot, ".jobs"), { recursive: true });
    const binDir = path.join(tmp, "bin");
    fs.mkdirSync(binDir);
    const seen = path.join(tmp, "seen-config.json");
    fs.writeFileSync(path.join(binDir, "opencode"), `#!/bin/sh\nprintf '%s' "$OPENCODE_CONFIG_CONTENT" > ${JSON.stringify(seen)}\necho done\n`, { mode: 0o755 });

    const configUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/config.js")).href;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", `
      const { reloadConfig } = await import(${JSON.stringify(configUrl)});
      reloadConfig();
      const { runPipelineWorker } = await import(${JSON.stringify(runnerUrl)});
      const result = await runPipelineWorker({
        name: "scribe-test", prompt: "test", timeoutMs: 30000,
        logDir: ${JSON.stringify(path.join(graphRoot, ".pipeline-logs"))},
        graphRoot: ${JSON.stringify(graphRoot)},
      });
      process.stdout.write(String(result.exitCode));
    `], {
      encoding: "utf-8",
      env: {
        ...process.env,
        GRAPH_MEMORY_ROOT: graphRoot,
        GRAPH_MEMORY_WORKER_PROVIDER: "opencode",
        GRAPH_MEMORY_WORKER_FALLBACK_PROVIDER: "",
        OPENCODE_CONFIG_CONTENT: "",
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      },
    });
    assert.equal(out, "0");
    assert.deepEqual(JSON.parse(fs.readFileSync(seen, "utf-8")), { snapshot: false });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
