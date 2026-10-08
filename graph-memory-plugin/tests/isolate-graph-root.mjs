// Preloaded into the test runner and every test file (`node --import`), so no
// test can reach the developer's real ~/.graph-memory: modules like events.ts
// fix their paths from CONFIG at import time, and a test that imports dist
// before pointing GRAPH_MEMORY_ROOT somewhere else would otherwise write the
// real activity log (or initialize the real graph).
//
// The runner creates one throwaway root and removes it on exit; test files
// inherit it through the environment. Tests that set their own root still win.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.GRAPH_MEMORY_TEST_SCRATCH) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-test-"));
  process.env.GRAPH_MEMORY_TEST_SCRATCH = scratch;
  process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
}

process.env.GRAPH_MEMORY_ROOT = path.join(process.env.GRAPH_MEMORY_TEST_SCRATCH, ".graph-memory");
