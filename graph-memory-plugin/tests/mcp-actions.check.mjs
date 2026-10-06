import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function importModule(name) {
  return import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
}

// The action called CommonJS `require` inside this ES module and failed with
// "require is not defined" before queuing anything.
test("compress action queues a compressor job", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-compress-"));
  const graphRoot = path.join(tmp, ".graph-memory");
  try {
    process.env.GRAPH_MEMORY_ROOT = graphRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { initializeGraph } = await importModule("index.js");
    initializeGraph();
    const { handleGraphMemory } = await importModule("tools.js");

    const result = await handleGraphMemory({ action: "compress" });
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.success, true);
    assert.match(body.jobId, /^compressor_/);
    assert.deepEqual(body.layers, ["global", "project"]);

    const queued = fs.readdirSync(path.join(graphRoot, ".jobs", "queued"));
    assert.ok(queued.includes(`${body.jobId}.json`), "job file is in the queue");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
