import fs from "fs";
import path from "path";
import type { WorkerProvider } from "../runtime.js";

// ── Worker credential rejection ─────────────────────────────────────────────
//
// A harness whose stored login has been revoked fails every job the same way
// within seconds, while its own status command can still say "logged in"
// (`codex login status` only checks that auth.json exists). Recording the
// rejection lets the runner stop spending fallback attempts on it and lets
// status surfaces report the real auth state instead of a stale "ready".

export interface AuthRejection {
  detectedAt: string;
  logFile: string;
  evidence: string;
}

type AuthRejectionState = Partial<Record<WorkerProvider, AuthRejection>>;

/** How long a recorded rejection suppresses fallback attempts on that harness. */
export const AUTH_REJECTION_SKIP_MS = 60 * 60 * 1000;

// A rejected login fails before doing any work, so the harness's error output
// is the tail of the log. Only the tail is scanned, because earlier lines hold
// the agent's own tool output, which can quote anything (including these logs).
const LOG_TAIL_BYTES = 4 * 1024;

// Matched against the harness's own error lines, not free text.
const REJECTION_PATTERNS: Partial<Record<WorkerProvider, RegExp[]>> = {
  codex: [
    /^ERROR: Your access token could not be refreshed\b.*$/m,
    /\bERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed\b.*$/m,
    /\bERROR codex_api::[\w:]+: .*\b401 Unauthorized\b.*$/m,
  ],
};

const REMEDIATION: Partial<Record<WorkerProvider, string>> = {
  codex:
    "give the worker its own login — Docker: bin/docker-codex-login.sh (or OPENAI_API_KEY=... bin/docker-codex-login-api-key.sh); manual mode: codex login",
};

export function authRemediation(provider: WorkerProvider): string {
  return REMEDIATION[provider] ?? `re-authenticate the ${provider} harness`;
}

/** Returns the harness error line proving the credentials were rejected, or null. */
export function detectAuthRejection(provider: WorkerProvider, logTail: string): string | null {
  for (const pattern of REJECTION_PATTERNS[provider] ?? []) {
    const match = logTail.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

export function readLogTail(logFile: string, bytes = LOG_TAIL_BYTES): string {
  let fd: number | null = null;
  try {
    fd = fs.openSync(logFile, "r");
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString("utf-8");
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
}

export function workerAuthStatePath(graphRoot: string): string {
  return path.join(graphRoot, ".jobs", "worker-auth.json");
}

function readState(graphRoot: string): AuthRejectionState {
  try {
    return JSON.parse(fs.readFileSync(workerAuthStatePath(graphRoot), "utf-8"));
  } catch {
    return {};
  }
}

function writeState(graphRoot: string, state: AuthRejectionState): void {
  const statePath = workerAuthStatePath(graphRoot);
  if (Object.keys(state).length === 0) {
    fs.rmSync(statePath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  fs.renameSync(tmp, statePath);
}

export function readAuthRejection(graphRoot: string, provider: WorkerProvider): AuthRejection | null {
  return readState(graphRoot)[provider] ?? null;
}

export function recordAuthRejection(graphRoot: string, provider: WorkerProvider, rejection: AuthRejection): void {
  writeState(graphRoot, { ...readState(graphRoot), [provider]: rejection });
}

export function clearAuthRejection(graphRoot: string, provider: WorkerProvider): void {
  const state = readState(graphRoot);
  if (!(provider in state)) return;
  delete state[provider];
  writeState(graphRoot, state);
}

export function isAuthRejectionFresh(rejection: AuthRejection, now = Date.now()): boolean {
  const detectedAt = Date.parse(rejection.detectedAt);
  return Number.isFinite(detectedAt) && now - detectedAt < AUTH_REJECTION_SKIP_MS;
}
