import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { getProjectWorkingPath } from "./working-files.js";

export type RefreshArtifact = "priors" | "soma" | "map" | "working" | "dreams";

interface SessionContextState {
  sessionId: string;
  projectName?: string;
  updatedAt: string;
  artifacts: Record<RefreshArtifact, number>;
}

const STATIC_ARTIFACT_PATHS: Omit<Record<RefreshArtifact, string>, "working"> & { working?: string } = {
  priors: CONFIG.paths.priors,
  soma: CONFIG.paths.soma,
  map: CONFIG.paths.map,
  dreams: CONFIG.paths.dreamsContext,
};

function getArtifactPath(artifact: RefreshArtifact, projectName?: string): string {
  if (artifact === "working") {
    return projectName && projectName !== "global"
      ? getProjectWorkingPath(projectName)
      : CONFIG.paths.workingGlobal;
  }
  return STATIC_ARTIFACT_PATHS[artifact]!;
}

function ensureSessionContextDir(): void {
  if (!fs.existsSync(CONFIG.paths.sessionContext)) {
    fs.mkdirSync(CONFIG.paths.sessionContext, { recursive: true });
  }
}

function statePath(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(CONFIG.paths.sessionContext, `${safeId}.json`);
}

export function readArtifactMtimes(projectName?: string): Record<RefreshArtifact, number> {
  return {
    priors: fs.existsSync(getArtifactPath("priors", projectName)) ? fs.statSync(getArtifactPath("priors", projectName)).mtimeMs : 0,
    soma: fs.existsSync(getArtifactPath("soma", projectName)) ? fs.statSync(getArtifactPath("soma", projectName)).mtimeMs : 0,
    map: fs.existsSync(getArtifactPath("map", projectName)) ? fs.statSync(getArtifactPath("map", projectName)).mtimeMs : 0,
    working: fs.existsSync(getArtifactPath("working", projectName)) ? fs.statSync(getArtifactPath("working", projectName)).mtimeMs : 0,
    dreams: fs.existsSync(getArtifactPath("dreams", projectName)) ? fs.statSync(getArtifactPath("dreams", projectName)).mtimeMs : 0,
  };
}

export function writeSessionContextState(sessionId: string, projectName?: string): void {
  ensureSessionContextDir();
  const payload: SessionContextState = {
    sessionId,
    projectName,
    updatedAt: new Date().toISOString(),
    artifacts: readArtifactMtimes(projectName),
  };
  fs.writeFileSync(statePath(sessionId), JSON.stringify(payload, null, 2));
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
  const current = readArtifactMtimes(projectName);

  if (!fs.existsSync(filePath)) {
    writeSessionContextState(sessionId, projectName);
    return [];
  }

  try {
    const previous = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SessionContextState;
    if ((previous.projectName || "global") !== (projectName || "global")) {
      writeSessionContextState(sessionId, projectName);
      return watched.filter((artifact) => current[artifact] > 0);
    }
    const changed = watched.filter((artifact) => (previous.artifacts?.[artifact] || 0) < current[artifact]);
    if (changed.length > 0) {
      fs.writeFileSync(filePath, JSON.stringify({
        sessionId,
        projectName,
        updatedAt: new Date().toISOString(),
        artifacts: current,
      }, null, 2));
    }
    return changed;
  } catch {
    writeSessionContextState(sessionId, projectName);
    return [];
  }
}

export function readArtifactContent(artifact: RefreshArtifact, projectName?: string): string {
  const filePath = getArtifactPath(artifact, projectName);
  if (!fs.existsSync(filePath)) return "";
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}
