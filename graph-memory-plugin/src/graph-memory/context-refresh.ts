import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { listOpenSessions } from "./project.js";
import { readOwnWorkingUpdate } from "./project-working.js";

type FileArtifact = "priors" | "soma" | "map" | "dreams";

// "working" is this session's own handoff (outside a project, the global
// WORKING file). "sessions" is which other sessions are open in the project.
// Another session's progress changes neither, so it never re-sends WORKING to
// this one: it used to, and each session took the other's "Now" as its own.
export type RefreshArtifact = FileArtifact | "working" | "sessions";

interface SessionContextState {
  sessionId: string;
  projectName?: string;
  updatedAt: string;
  artifacts: Record<FileArtifact, number>;
  // Absent in states written before 3.8.0; the first diff records them.
  working?: string;
  openSessions?: string[];
}

const FILE_ARTIFACT_PATHS: Record<FileArtifact, string> = {
  priors: CONFIG.paths.priors,
  soma: CONFIG.paths.soma,
  map: CONFIG.paths.map,
  dreams: CONFIG.paths.dreamsContext,
};

function ensureSessionContextDir(): void {
  if (!fs.existsSync(CONFIG.paths.sessionContext)) {
    fs.mkdirSync(CONFIG.paths.sessionContext, { recursive: true });
  }
}

function statePath(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(CONFIG.paths.sessionContext, `${safeId}.json`);
}

function mtimeOf(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
}

function readFileArtifactMtimes(): Record<FileArtifact, number> {
  return {
    priors: mtimeOf(FILE_ARTIFACT_PATHS.priors),
    soma: mtimeOf(FILE_ARTIFACT_PATHS.soma),
    map: mtimeOf(FILE_ARTIFACT_PATHS.map),
    dreams: mtimeOf(FILE_ARTIFACT_PATHS.dreams),
  };
}

function readWorkingMarker(sessionId: string, projectName?: string): string {
  if (!projectName || projectName === "global") {
    const mtime = mtimeOf(CONFIG.paths.workingGlobal);
    return mtime ? String(mtime) : "";
  }
  return readOwnWorkingUpdate(projectName, sessionId);
}

function captureState(sessionId: string, projectName?: string): SessionContextState {
  return {
    sessionId,
    projectName,
    updatedAt: new Date().toISOString(),
    artifacts: readFileArtifactMtimes(),
    working: readWorkingMarker(sessionId, projectName),
    openSessions: listOpenSessions(projectName || "global", { excludeSessionId: sessionId })
      .map((session) => session.sessionId)
      .sort(),
  };
}

function changedSince(artifact: RefreshArtifact, previous: SessionContextState, current: SessionContextState): boolean {
  switch (artifact) {
    case "working":
      // "" means this session's entry is gone (its work wasn't about this
      // project after all), which leaves it nothing new to read.
      return previous.working !== undefined && current.working !== "" && previous.working !== current.working;
    case "sessions":
      return previous.openSessions !== undefined && previous.openSessions.join("\n") !== (current.openSessions || []).join("\n");
    default:
      return (previous.artifacts?.[artifact] || 0) < current.artifacts[artifact];
  }
}

function hasContent(artifact: RefreshArtifact, current: SessionContextState): boolean {
  switch (artifact) {
    case "working":
      return true;
    case "sessions":
      return (current.openSessions || []).length > 0;
    default:
      return current.artifacts[artifact] > 0;
  }
}

function saveState(state: SessionContextState): void {
  fs.writeFileSync(statePath(state.sessionId), JSON.stringify(state, null, 2));
}

export function writeSessionContextState(sessionId: string, projectName?: string): void {
  ensureSessionContextDir();
  saveState(captureState(sessionId, projectName));
}

export function clearSessionContextState(sessionId?: string): void {
  if (!sessionId) return;
  try {
    const filePath = statePath(sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch { /* ignore */ }
}

export function diffSessionContextState(
  sessionId: string,
  projectName?: string,
  watched: RefreshArtifact[] = ["priors", "soma", "map", "working"]
): RefreshArtifact[] {
  ensureSessionContextDir();
  const filePath = statePath(sessionId);
  const current = captureState(sessionId, projectName);

  if (!fs.existsSync(filePath)) {
    saveState(current);
    return [];
  }

  try {
    const previous = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SessionContextState;
    if ((previous.projectName || "global") !== (projectName || "global")) {
      saveState(current);
      return watched.filter((artifact) => hasContent(artifact, current));
    }
    const changed = watched.filter((artifact) => changedSince(artifact, previous, current));
    if (changed.length > 0 || previous.working === undefined || previous.openSessions === undefined) {
      saveState(current);
    }
    return changed;
  } catch {
    saveState(current);
    return [];
  }
}
