import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";
import { ensureLockDirectories, getGlobalLockPath, getProjectLockPath } from "../working-files.js";

// A chain lock keeps one auditor -> librarian -> dreamer chain per project (or
// one global chain) running at a time. Only the daemon takes them, and
// daemon.lock keeps it to a single instance.

const LOCK_TTL_MS = 30 * 60 * 1000;

function acquireChainLock(lockPath: string, heldMessage: string, owner: Record<string, unknown>): void {
  ensureLockDirectories();
  if (fs.existsSync(lockPath)) {
    let startedAtMs = 0;
    try {
      startedAtMs = JSON.parse(fs.readFileSync(lockPath, "utf-8")).startedAtMs || 0;
    } catch { /* unreadable: treat as stale */ }
    // A held lock belongs to someone else; leave it in place.
    if (Date.now() - startedAtMs < LOCK_TTL_MS) throw new Error(heldMessage);
    fs.rmSync(lockPath, { force: true });
  }
  fs.writeFileSync(lockPath, JSON.stringify({
    ...owner,
    pid: process.pid,
    startedAtMs: Date.now(),
    startedAt: new Date().toISOString(),
  }, null, 2));
}

export function acquireProjectChainLock(project: string): void {
  acquireChainLock(getProjectLockPath(project), `Project chain lock held for ${project}`, { project });
}

export function releaseProjectChainLock(project: string): void {
  fs.rmSync(getProjectLockPath(project), { force: true });
}

export function acquireGlobalChainLock(): void {
  acquireChainLock(getGlobalLockPath(), "Global chain lock held", {});
}

export function releaseGlobalChainLock(): void {
  fs.rmSync(getGlobalLockPath(), { force: true });
}

/**
 * Remove every chain lock. Call only at daemon startup: no chain is running
 * yet, so any lock present was left by a daemon stopped mid-chain. (In Docker
 * the daemon is always pid 1, so the recorded pid can't tell them apart.)
 * Returns how many locks were removed.
 */
export function clearChainLocks(): number {
  let removed = 0;
  const lockDir = CONFIG.paths.projectLocks;
  if (fs.existsSync(lockDir)) {
    for (const file of fs.readdirSync(lockDir)) {
      fs.rmSync(path.join(lockDir, file), { force: true });
      removed++;
    }
  }
  if (fs.existsSync(getGlobalLockPath())) {
    fs.rmSync(getGlobalLockPath(), { force: true });
    removed++;
  }
  return removed;
}
