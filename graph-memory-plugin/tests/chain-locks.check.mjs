import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);

async function withGraphRoot(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chain-locks-"));
  try {
    process.env.GRAPH_MEMORY_ROOT = path.join(tmp, ".graph-memory");
    const { reloadConfig } = await importModule("config.js");
    reloadConfig();
    const locks = await importModule("pipeline/chain-locks.js");
    const { getProjectLockPath, getGlobalLockPath } = await importModule("working-files.js");
    await fn({ locks, getProjectLockPath, getGlobalLockPath });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The old acquire deleted the lock file on its way to reporting it as held, so a
// blocked attempt silently freed a chain that was still running.
test("a held chain lock blocks a second acquire and stays in place", async () => {
  await withGraphRoot(async ({ locks, getProjectLockPath }) => {
    locks.acquireProjectChainLock("acme/app");
    const lockPath = getProjectLockPath("acme/app");
    const before = fs.readFileSync(lockPath, "utf-8");
    assert.throws(() => locks.acquireProjectChainLock("acme/app"), /Project chain lock held for acme\/app/);
    assert.equal(fs.readFileSync(lockPath, "utf-8"), before, "the holder's lock is untouched");
    locks.releaseProjectChainLock("acme/app");
    assert.equal(fs.existsSync(lockPath), false);
  });
});

test("expired or unreadable chain locks are replaced", async () => {
  await withGraphRoot(async ({ locks, getProjectLockPath, getGlobalLockPath }) => {
    locks.acquireProjectChainLock("acme/app");
    const lockPath = getProjectLockPath("acme/app");
    fs.writeFileSync(lockPath, JSON.stringify({ startedAtMs: Date.now() - 31 * 60 * 1000 }));
    locks.acquireProjectChainLock("acme/app");
    assert.ok(Date.now() - JSON.parse(fs.readFileSync(lockPath, "utf-8")).startedAtMs < 5000);

    fs.writeFileSync(getGlobalLockPath(), "{not json");
    locks.acquireGlobalChainLock();
    assert.ok(JSON.parse(fs.readFileSync(getGlobalLockPath(), "utf-8")).startedAtMs);
  });
});

// A daemon stopped mid-chain left a fresh-looking lock, and the restarted daemon
// then skipped the requeued job as if another chain were running.
test("clearChainLocks removes every lock left by a previous daemon", async () => {
  await withGraphRoot(async ({ locks, getProjectLockPath, getGlobalLockPath }) => {
    locks.acquireProjectChainLock("acme/app");
    locks.acquireProjectChainLock("acme/api");
    locks.acquireGlobalChainLock();
    assert.equal(locks.clearChainLocks(), 3);
    assert.equal(fs.existsSync(getProjectLockPath("acme/app")), false);
    assert.equal(fs.existsSync(getGlobalLockPath()), false);
    locks.acquireProjectChainLock("acme/app");
    assert.equal(locks.clearChainLocks(), 1);
    assert.equal(locks.clearChainLocks(), 0);
  });
});
