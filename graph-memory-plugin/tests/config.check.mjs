import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const configUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/config.js")).href;

// config.js fixes the pointer-file path from HOME at import, so each case runs
// in a child process with a HOME of its own (never the developer's real one).
function isGraphInitializedWith({ home, graphMemoryRoot }) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.GRAPH_MEMORY_ROOT;
  if (graphMemoryRoot) env.GRAPH_MEMORY_ROOT = graphMemoryRoot;
  const out = execFileSync(process.execPath, [
    "--input-type=module", "-e",
    `const { isGraphInitialized } = await import(${JSON.stringify(configUrl)}); process.stdout.write(String(isGraphInitialized()));`,
  ], { encoding: "utf-8", env });
  return out === "true";
}

function graphDir(parent, name, { initialized }) {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  if (initialized) fs.writeFileSync(path.join(root, "MAP.md"), "# MAP\n");
  return root;
}

function homeDir(parent, name, pointerTo) {
  const home = path.join(parent, name);
  fs.mkdirSync(home, { recursive: true });
  if (pointerTo) fs.writeFileSync(path.join(home, ".graph-memory-config.yml"), `graphRoot: ${JSON.stringify(pointerTo)}\n`);
  return home;
}

// isGraphInitialized read only the pointer file while CONFIG resolved
// GRAPH_MEMORY_ROOT first: in the daemon container (no pointer file) it said
// "not initialized" about the graph in use, and hooks under a test root bailed.
test("isGraphInitialized checks the graph root CONFIG resolves", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graph-initialized-"));
  try {
    const ready = graphDir(tmp, "ready", { initialized: true });
    const empty = graphDir(tmp, "empty", { initialized: false });

    assert.equal(isGraphInitializedWith({ home: homeDir(tmp, "h1"), graphMemoryRoot: ready }), true,
      "GRAPH_MEMORY_ROOT counts without a pointer file");
    assert.equal(isGraphInitializedWith({ home: homeDir(tmp, "h2", ready), graphMemoryRoot: empty }), false,
      "GRAPH_MEMORY_ROOT wins over a pointer to some other initialized graph");
    assert.equal(isGraphInitializedWith({ home: homeDir(tmp, "h3", ready) }), true,
      "the pointer file still counts without GRAPH_MEMORY_ROOT");
    assert.equal(isGraphInitializedWith({ home: homeDir(tmp, "h4") }), false,
      "nothing initialized anywhere");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
