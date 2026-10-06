import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "../dist/graph-memory/frontmatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function importModule(name) {
  return import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
}

function writeNode(graphRoot, nodePath, gist) {
  const file = path.join(graphRoot, "nodes", `${nodePath}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify(`# ${nodePath}\n`, {
    id: nodePath,
    gist,
    confidence: 0.8,
    created: "2026-10-01",
    updated: "2026-10-01",
    decay_rate: 0.05,
    tags: [],
    category: nodePath.split("/")[0],
  }));
}

// Pipeline workers find node files from MAP.md alone. Without the layout stated,
// a scribe on glm-5.3-flash read `<root>/<path>.md` in 4 of 6 live runs.
test("MAP header states where node files live, and the statement holds for every entry", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worker-paths-"));
  const graphRoot = path.join(tmp, ".graph-memory");
  try {
    process.env.GRAPH_MEMORY_ROOT = graphRoot;
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const { initializeGraph } = await importModule("index.js");
    initializeGraph();

    writeNode(graphRoot, "preferences/decision_style", "Verify carefully before acting");
    writeNode(graphRoot, "projects/acme/launch_plan", "Launch sequencing for the acme rollout");

    const { fullRegenerateMAP } = await importModule("pipeline/graph-ops.js");
    fullRegenerateMAP();
    const map = fs.readFileSync(path.join(graphRoot, "MAP.md"), "utf-8");

    assert.match(map, /node `category\/name` lives in the file `nodes\/category\/name\.md`/);

    const entries = [...map.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1]);
    assert.ok(entries.includes("preferences/decision_style"));
    assert.ok(entries.includes("projects/acme/launch_plan"));
    for (const entry of entries) {
      assert.ok(fs.existsSync(path.join(graphRoot, "nodes", `${entry}.md`)), `nodes/${entry}.md should exist`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("scribe prompt maps MAP node ids to nodes/<id>.md files", () => {
  const prompt = fs.readFileSync(path.join(pluginDir, "agents", "memory-scribe.md"), "utf-8");
  assert.match(prompt, /Node `category\/name` is the file `nodes\/category\/name\.md`/);
});
