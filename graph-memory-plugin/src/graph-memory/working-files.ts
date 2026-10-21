import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export function sanitizeProjectSlug(projectName: string): string {
  return projectName.replace(/[^a-zA-Z0-9._-]+/g, "__") || "global";
}

// An "owner/repo" or bare name a caller can hand us: no path segment of "." or
// "..", so it can't walk out of the directory it is joined onto, and nothing
// but name characters, so it reads as a name wherever it is quoted.
export function isSafeProjectName(projectName: string): boolean {
  if (projectName.length === 0 || projectName.length > 200) return false;
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/.test(projectName)) return false;
  return projectName.split("/").every((segment) => segment !== "." && segment !== "..");
}

export function getProjectWorkingPath(projectName: string): string {
  return path.join(CONFIG.paths.workingProjects, `${sanitizeProjectSlug(projectName)}.md`);
}

export function getProjectWorkingStatePath(projectName: string): string {
  return path.join(CONFIG.paths.workingProjects, `${sanitizeProjectSlug(projectName)}.state.json`);
}

export function getProjectWorkingUpdatesDir(projectName: string): string {
  return path.join(CONFIG.paths.workingProjects, "_updates", sanitizeProjectSlug(projectName));
}

export function getProjectWorkingUpdatePath(projectName: string, sessionId: string): string {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(getProjectWorkingUpdatesDir(projectName), `${safeSessionId}.json`);
}

export function getFileInteractionPath(projectName: string, sessionId: string): string {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(getProjectWorkingUpdatesDir(projectName), `${safeSessionId}.files.json`);
}

export function getProjectAuditDir(projectName: string): string {
  return path.join(CONFIG.paths.auditProjects, sanitizeProjectSlug(projectName));
}

export function getProjectPreflightPath(projectName: string): string {
  return path.join(getProjectAuditDir(projectName), "preflight.json");
}

export function getProjectAuditReportPath(projectName: string): string {
  return path.join(getProjectAuditDir(projectName), "report.json");
}

export function getProjectAuditBriefPath(projectName: string): string {
  return path.join(getProjectAuditDir(projectName), "brief.md");
}

export function getProjectDreamsDir(projectName: string): string {
  return path.join(CONFIG.paths.dreamsProjects, sanitizeProjectSlug(projectName));
}

export function getProjectDreamSummaryPath(projectName: string): string {
  return path.join(getProjectDreamsDir(projectName), "summary.md");
}

export function getProjectLockPath(projectName: string): string {
  return path.join(CONFIG.paths.projectLocks, `${sanitizeProjectSlug(projectName)}.lock`);
}

export function getGlobalLockPath(): string {
  return CONFIG.paths.globalLock;
}

export function ensureWorkingDirectories(): void {
  for (const dir of [CONFIG.paths.workingRoot, CONFIG.paths.workingProjects, path.join(CONFIG.paths.workingProjects, "_updates")]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureAuditDirectories(projectName: string): void {
  const dir = getProjectAuditDir(projectName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureDreamDirectories(projectName: string): void {
  const dir = getProjectDreamsDir(projectName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureLockDirectories(): void {
  for (const dir of [CONFIG.paths.projectLocks]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
