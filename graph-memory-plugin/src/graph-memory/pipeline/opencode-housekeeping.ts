import { execFile } from "child_process";
import os from "os";
import path from "path";
import { CONFIG } from "../config.js";
import { activityBus } from "../events.js";

// opencode keeps every pipeline run as a session in its own SQLite database.
// Nothing in graph-memory reads it: worker outputs land in the graph root and
// their logs in .pipeline-logs. Old pipeline sessions are deleted through
// opencode's own CLI, which removes their messages, parts, and events. Freed
// pages are reused for new sessions, so the file stops growing; VACUUM, which
// rewrites the whole file, runs only once a quarter of it is free.

export const OPENCODE_SESSION_RETENTION_DAYS = 7;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_DELETES_PER_RUN = 100;
const VACUUM_FREE_RATIO = 0.25;

export interface OpencodeResult {
  ok: boolean;
  stdout: string;
  missing?: boolean;
}

export type OpencodeRunner = (args: string[]) => Promise<OpencodeResult>;

const runOpencode: OpencodeRunner = (args) =>
  new Promise((resolve) => {
    execFile("opencode", args, { cwd: os.tmpdir(), timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      resolve({
        ok: !err,
        stdout: stdout ?? "",
        missing: (err as NodeJS.ErrnoException | null)?.code === "ENOENT",
      });
    });
  });

async function pragma(run: OpencodeRunner, name: string): Promise<number | null> {
  const result = await run(["db", `PRAGMA ${name}`, "--format", "json"]);
  if (!result.ok) return null;
  try {
    const value = Object.values(JSON.parse(result.stdout)[0] ?? {})[0];
    return typeof value === "number" ? value : Number(value);
  } catch {
    return null;
  }
}

interface SessionRow {
  id: string;
  directory: string;
  time_updated: number;
}

let lastRunAt = 0;

export interface PruneResult {
  deleted: number;
  failed: number;
  vacuumed: boolean;
  skipped?: string;
}

/**
 * Delete opencode sessions that pipeline workers created in the graph root and
 * that haven't been updated within the retention window, oldest first and at
 * most MAX_DELETES_PER_RUN per pass, then VACUUM once enough of the file is
 * free to be worth rewriting. Runs at most every six hours unless forced.
 * Sessions in any other directory, such as a user's own interactive opencode
 * work on a shared host, are never touched.
 */
export async function pruneOpencodeSessions(opts: {
  now?: number;
  force?: boolean;
  retentionDays?: number;
  graphRoot?: string;
  run?: OpencodeRunner;
} = {}): Promise<PruneResult> {
  const now = opts.now ?? Date.now();
  if (!opts.force && now - lastRunAt < RUN_INTERVAL_MS) {
    return { deleted: 0, failed: 0, vacuumed: false, skipped: "interval" };
  }
  lastRunAt = now;

  const run = opts.run ?? runOpencode;
  const graphRoot = path.resolve(opts.graphRoot ?? CONFIG.paths.graphRoot);
  const cutoff = now - (opts.retentionDays ?? OPENCODE_SESSION_RETENTION_DAYS) * 24 * 60 * 60 * 1000;

  const listed = await run(["db", "SELECT id, directory, time_updated FROM session", "--format", "json"]);
  if (!listed.ok) {
    return { deleted: 0, failed: 0, vacuumed: false, skipped: listed.missing ? "opencode not installed" : "session list failed" };
  }

  let sessions: SessionRow[];
  try {
    sessions = JSON.parse(listed.stdout.trim() || "[]");
  } catch {
    return { deleted: 0, failed: 0, vacuumed: false, skipped: "unreadable session list" };
  }

  const expired = sessions
    .filter((s) => typeof s.directory === "string" && path.resolve(s.directory) === graphRoot && Number(s.time_updated) < cutoff)
    .sort((a, b) => Number(a.time_updated) - Number(b.time_updated))
    .slice(0, MAX_DELETES_PER_RUN);
  if (expired.length === 0) return { deleted: 0, failed: 0, vacuumed: false };

  let deleted = 0;
  let failed = 0;
  for (const session of expired) {
    if ((await run(["session", "delete", session.id])).ok) deleted++;
    else failed++;
  }

  let vacuumed = false;
  if (deleted > 0) {
    const pages = await pragma(run, "page_count");
    const free = await pragma(run, "freelist_count");
    if (pages && free !== null && free / pages >= VACUUM_FREE_RATIO) {
      vacuumed = (await run(["db", "VACUUM"])).ok;
    }
  }
  activityBus.log("system:info", `Pruned ${deleted} opencode pipeline session(s) older than ${opts.retentionDays ?? OPENCODE_SESSION_RETENTION_DAYS} days`, {
    deleted,
    failed,
    vacuumed,
  });
  return { deleted, failed, vacuumed };
}
