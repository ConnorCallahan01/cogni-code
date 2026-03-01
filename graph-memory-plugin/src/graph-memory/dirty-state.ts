import fs from "fs";
import { CONFIG } from "./config.js";

interface DirtyState {
  sessionId: string;
  startedAt: string;
  pid: number;
}

interface ConsolidationPending {
  reason: string;
  createdAt: string;
  sessionId?: string;
}

export function markDirty(sessionId: string): void {
  const state: DirtyState = {
    sessionId,
    startedAt: new Date().toISOString(),
    pid: process.pid,
  };
  fs.writeFileSync(CONFIG.paths.dirtyState, JSON.stringify(state));
}

export function clearDirty(): void {
  try {
    if (fs.existsSync(CONFIG.paths.dirtyState)) {
      fs.unlinkSync(CONFIG.paths.dirtyState);
    }
  } catch { /* ignore */ }
}

export function isDirty(): { dirty: boolean; sessionId?: string } {
  if (!fs.existsSync(CONFIG.paths.dirtyState)) {
    return { dirty: false };
  }
  try {
    const state: DirtyState = JSON.parse(fs.readFileSync(CONFIG.paths.dirtyState, "utf-8"));
    return { dirty: true, sessionId: state.sessionId };
  } catch {
    return { dirty: true };
  }
}

export function setConsolidationPending(reason: string, sessionId?: string): void {
  const pending: ConsolidationPending = {
    reason,
    createdAt: new Date().toISOString(),
    sessionId,
  };
  fs.writeFileSync(CONFIG.paths.consolidationPending, JSON.stringify(pending));
}

export function clearConsolidationPending(): void {
  try {
    if (fs.existsSync(CONFIG.paths.consolidationPending)) {
      fs.unlinkSync(CONFIG.paths.consolidationPending);
    }
  } catch { /* ignore */ }
}

export function isConsolidationPending(): { pending: boolean; summary?: string } {
  if (!fs.existsSync(CONFIG.paths.consolidationPending)) {
    return { pending: false };
  }
  try {
    const data: ConsolidationPending = JSON.parse(
      fs.readFileSync(CONFIG.paths.consolidationPending, "utf-8")
    );
    return { pending: true, summary: data.reason };
  } catch {
    return { pending: true };
  }
}
