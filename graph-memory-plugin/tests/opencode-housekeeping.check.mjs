import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const { pruneOpencodeSessions, OPENCODE_SESSION_RETENTION_DAYS } = await import(
  pathToFileURL(path.join(pluginDir, "dist/graph-memory/pipeline/opencode-housekeeping.js")).href
);

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T20:00:00Z");
const GRAPH = "/graph-memory";

function fakeOpencode(sessions, { failDeleteFor = new Set(), missing = false, pageCount = 1000, freePages = 500 } = {}) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (missing) return { ok: false, stdout: "", missing: true };
    if (args[0] === "db" && args[1].startsWith("SELECT")) return { ok: true, stdout: JSON.stringify(sessions) };
    if (args[0] === "session" && args[1] === "delete") return { ok: !failDeleteFor.has(args[2]), stdout: "" };
    if (args[0] === "db" && args[1] === "PRAGMA page_count") return { ok: true, stdout: JSON.stringify([{ page_count: pageCount }]) };
    if (args[0] === "db" && args[1] === "PRAGMA freelist_count") return { ok: true, stdout: JSON.stringify([{ freelist_count: freePages }]) };
    if (args[0] === "db" && args[1] === "VACUUM") return { ok: true, stdout: "" };
    throw new Error(`unexpected opencode call: ${args.join(" ")}`);
  };
  const deletes = () => calls.filter((a) => a[0] === "session").map((a) => a[2]);
  const vacuums = () => calls.filter((a) => a[1] === "VACUUM").length;
  return { run, deletes, vacuums };
}

const session = (id, directory, ageDays) => ({ id, directory, time_updated: NOW - ageDays * DAY });

test("prunes only expired graph-root sessions, oldest first, then vacuums", async () => {
  const oc = fakeOpencode([
    session("recent", GRAPH, 1),
    session("old", GRAPH, OPENCODE_SESSION_RETENTION_DAYS + 1),
    session("oldest", GRAPH, 40),
    session("user-project", "/Users/someone/code/app", 60),
    session("graph-subdir", `${GRAPH}/nodes`, 60),
  ]);
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: oc.run });
  assert.deepEqual(oc.deletes(), ["oldest", "old"]);
  assert.equal(oc.vacuums(), 1);
  assert.deepEqual(result, { deleted: 2, failed: 0, vacuumed: true });
});

test("caps deletions per pass", async () => {
  const many = Array.from({ length: 150 }, (_, i) => session(`s${i}`, GRAPH, 30 + i));
  const oc = fakeOpencode(many);
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: oc.run });
  assert.equal(result.deleted, 100);
  assert.equal(oc.deletes()[0], "s149", "oldest first");
});

test("nothing expired means no deletes and no vacuum", async () => {
  const oc = fakeOpencode([session("recent", GRAPH, 1)]);
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: oc.run });
  assert.deepEqual(result, { deleted: 0, failed: 0, vacuumed: false });
  assert.equal(oc.vacuums(), 0);
});

test("a failed delete is counted and the rest still go", async () => {
  const oc = fakeOpencode([session("a", GRAPH, 30), session("b", GRAPH, 20)], { failDeleteFor: new Set(["a"]) });
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: oc.run });
  assert.deepEqual(result, { deleted: 1, failed: 1, vacuumed: true });
});

test("skips quietly when opencode is not installed", async () => {
  const oc = fakeOpencode([], { missing: true });
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: oc.run });
  assert.equal(result.skipped, "opencode not installed");
});

test("runs at most every six hours unless forced", async () => {
  const oc = fakeOpencode([session("old", GRAPH, 30)]);
  const later = NOW + 30 * DAY;
  assert.equal((await pruneOpencodeSessions({ now: later, graphRoot: GRAPH, run: oc.run })).deleted, 1);
  assert.equal((await pruneOpencodeSessions({ now: later + 60_000, graphRoot: GRAPH, run: oc.run })).skipped, "interval");
  assert.notEqual((await pruneOpencodeSessions({ now: later + 7 * 60 * 60 * 1000, graphRoot: GRAPH, run: oc.run })).skipped, "interval");
});

test("vacuums only once a quarter of the file is free", async () => {
  const sparse = fakeOpencode([session("old", GRAPH, 30)], { pageCount: 1000, freePages: 100 });
  const result = await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: sparse.run });
  assert.deepEqual(result, { deleted: 1, failed: 0, vacuumed: false });
  assert.equal(sparse.vacuums(), 0, "10% free: a full rewrite isn't worth it yet");

  const dense = fakeOpencode([session("old", GRAPH, 30)], { pageCount: 1000, freePages: 250 });
  assert.equal((await pruneOpencodeSessions({ now: NOW, force: true, graphRoot: GRAPH, run: dense.run })).vacuumed, true);
});
