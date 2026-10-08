import type { WorkerProvider } from "../runtime.js";
import { detectAuthRejection } from "./worker-auth.js";

// ── Transient worker failures ───────────────────────────────────────────────
//
// Some worker failures say nothing about the job: the harness could not reach
// its provider (the Mac was asleep, Wi-Fi was off, DNS was gone) or its local
// store was busy. Running the same job again later succeeds, so the daemon
// defers it with a backoff instead of failing it for good — a failed scribe
// job's snapshot is swept after a few hours, and that session is lost.

export type TransientKind = "network" | "busy";

export interface TransientFailure {
  kind: TransientKind;
  evidence: string;
}

// Matched against the harness's own error lines (ANSI stripped), taken from
// the tail of real failed runs; earlier log lines are the agent's tool output.
const TRANSIENT_PATTERNS: Partial<Record<WorkerProvider, Array<[TransientKind, RegExp]>>> = {
  opencode: [
    ["network", /^Error: Cannot connect to API:.*$/m],
    ["network", /^Error: Connection reset by server\b.*$/m],
    ["busy", /^Error: Unexpected error\s*\n\s*database is locked\s*$/m],
  ],
  codex: [
    ["network", /^ERROR: workspace routing discovery failed\b.*$/m],
    ["network", /^ERROR: stream disconnected before completion: error sending request for url\b.*$/m],
    ["network", /\bERROR codex_login::auth::manager: Failed to refresh token: error sending request for url\b.*$/m],
    ["network", /^Error: timed out waiting for cloud config bundle\b.*$/m],
  ],
};

const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Returns the harness error line showing a failed run was transient, or null.
 * A credential rejection is never transient, even when network errors from the
 * same run sit next to it: retrying it later would just fail again.
 */
export function detectTransientFailure(provider: WorkerProvider, logTail: string): TransientFailure | null {
  const text = logTail.replace(ANSI, "");
  if (detectAuthRejection(provider, text)) return null;
  for (const [kind, pattern] of TRANSIENT_PATTERNS[provider] ?? []) {
    const match = text.match(pattern);
    if (match) return { kind, evidence: match[0].trim().replace(/\s*\n\s*/g, " ") };
  }
  return null;
}

/** How many times a job is deferred for transient failures before it fails for good. */
export const TRANSIENT_DEFER_LIMIT = 24;

const FIRST_RETRY_MS = 2 * 60 * 1000;
const MAX_RETRY_MS = 30 * 60 * 1000;

/** 2, 4, 8, 16, then every 30 minutes: ~10 hours of awake time across the limit. */
export function transientRetryDelayMs(deferrals: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, deferrals));
}

/** Thrown when a job's worker could not run for a transient reason. */
export class WorkerUnavailableError extends Error {
  readonly transient: TransientFailure;
  readonly provider: WorkerProvider;
  readonly logFile: string;

  constructor(provider: WorkerProvider, transient: TransientFailure, logFile: string) {
    super(`Worker (${provider}) unavailable (${transient.kind}): ${transient.evidence}. See ${logFile}`);
    this.name = "WorkerUnavailableError";
    this.provider = provider;
    this.transient = transient;
    this.logFile = logFile;
  }
}
