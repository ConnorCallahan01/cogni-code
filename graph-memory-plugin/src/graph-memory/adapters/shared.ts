import { CONFIG } from "../config.js";
import { detectProject, ProjectInfo, writeActiveProject, cleanActiveProjects, removeActiveProject, readActiveProject } from "../project.js";
import { hasV3Data, buildV3Context } from "../session-start-context.js";
import { isDirty, markDirty, clearDirty } from "../dirty-state.js";
import { writeSessionContextState, clearSessionContextState } from "../context-refresh.js";
import { ensureProjectWorkingFile } from "../project-working.js";
import { enqueueJob } from "../pipeline/job-queue.js";
import { activityBus } from "../events.js";
import fs from "fs";
import path from "path";

function buildProjectMAPShared(projectName: string, budget: number): string | null {
  const indexPath = CONFIG.paths.index;
  if (!fs.existsSync(indexPath)) return null;

  let index: any[];
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch { return null; }

  const categories = new Map<string, Array<{ path: string; line: string; confidence: number; projectRelevant: boolean }>>();

  for (const entry of index) {
    if (!entry.gist) continue;
    const cat = (entry.path || "").split("/")[0] || "uncategorized";
    const isProjectNode = !entry.project || entry.project === projectName;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push({
      path: entry.path,
      line: `- **${entry.path}**${entry.pinned ? " [pinned]" : ""} — ${entry.gist}`,
      confidence: entry.confidence || 0.5,
      projectRelevant: isProjectNode,
    });
  }

  const output: string[] = [];
  const sortedCats = [...categories.entries()].sort(([a], [b]) => a.localeCompare(b));
  let tokensUsed = 0;

  for (const [cat, entries] of sortedCats) {
    const projectEntries = entries.filter(e => e.projectRelevant);
    const otherEntries = entries.filter(e => !e.projectRelevant);

    const selected = [
      ...projectEntries.sort((a, b) => b.confidence - a.confidence).slice(0, 8),
      ...otherEntries.sort((a, b) => b.confidence - a.confidence).slice(0, 2),
    ];

    if (selected.length === 0) continue;

    const catBlock: string[] = [`## ${cat}`, ""];
    for (const e of selected) catBlock.push(e.line);
    const skipped = entries.length - selected.length;
    if (skipped > 0) catBlock.push(`  ... and ${skipped} more (use recall to explore)`);
    catBlock.push("");

    const catTokens = Math.ceil(catBlock.join("\n").length / 4);
    if (tokensUsed + catTokens > budget) break;

    output.push(...catBlock);
    tokensUsed += catTokens;
  }

  return output.join("\n");
}

export interface SessionStartContext {
  project: ProjectInfo;
  sessionId: string;
  mentalModelUsed: boolean;
  tokensUsed: number;
}

export function buildSessionStartContext(cwd: string, sessionId: string): SessionStartContext {
  const project = detectProject(cwd);
  writeActiveProject(sessionId, { name: project.name, gitRoot: project.gitRoot, cwd });
  cleanActiveProjects();

  let mentalModelUsed = false;
  let tokensUsed = 0;

  if (hasV3Data()) {
    const ctx = buildV3Context(project.name);
    if (!ctx.sources.fallback && ctx.context) {
      mentalModelUsed = true;
      tokensUsed = ctx.tokensUsed;
      markDirty(sessionId);
      writeSessionContextState(sessionId, project.name);
      return { project, sessionId, mentalModelUsed, tokensUsed };
    }
  }

  return { project, sessionId, mentalModelUsed: false, tokensUsed };
}

export function buildV2Injection(project: ProjectInfo): string {
  const maxSessionTokens = CONFIG.graph.maxSessionStartTokens || 15000;
  const globalBudget = 4000;
  const projectBudget = maxSessionTokens - globalBudget;
  const parts: string[] = [];

  const dirtyCheck = isDirty();
  if (dirtyCheck.dirty) {
    parts.push("[graph-memory] Dirty state from a previous session. Background daemon should reconcile.");
  }

  try { ensureProjectWorkingFile(project.name); } catch { /* ok */ }

  // mental model whisper layer (compressed guardrails + style + context from compressor)
  const whisperPath = path.join(CONFIG.paths.graphRoot, "mind", "whisper.txt");
  try {
    if (fs.existsSync(whisperPath)) {
      const whisperContent = fs.readFileSync(whisperPath, "utf-8").trim();
      if (whisperContent) {
        parts.push("# Operational Context\n\n" + whisperContent);
      }
    }
  } catch { /* ok */ }

  const globalFiles = [
    { filePath: CONFIG.paths.priors, label: "PRIORS" },
    { filePath: CONFIG.paths.soma, label: "SOMA" },
    { filePath: CONFIG.paths.dreamsContext, label: "DREAMS" },
  ];

  for (const { filePath, label } of globalFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content) parts.push("## " + label + "\n\n" + content);
    }
  }

  if (project.name !== "global") {
    const workingPath = path.join(CONFIG.paths.workingProjects, project.name.replace(/[^a-zA-Z0-9._-]+/g, "__") + ".md");
    if (fs.existsSync(workingPath)) {
      const content = fs.readFileSync(workingPath, "utf-8").trim();
      if (content) parts.push("## PROJECT WORKING\n\n" + content);
    }
  }

  if (fs.existsSync(CONFIG.paths.index)) {
    try {
      const projectMAP = buildProjectMAPShared(project.name, 5000);
      if (projectMAP) parts.push("## MAP\n\n" + projectMAP);
    } catch { /* skip */ }
  }

  return parts.join("\n\n");
}

export function flushAndQueueJobs(sessionId: string, project: string): void {
  const bufferDir = CONFIG.paths.buffer;
  if (!fs.existsSync(bufferDir)) return;

  const sessionLog = path.join(bufferDir, "conversation-" + sessionId + ".jsonl");
  if (!fs.existsSync(sessionLog)) return;

  const snapshotName = "snapshot_" + Date.now() + ".jsonl";
  const snapshotPath = path.join(bufferDir, snapshotName);
  fs.renameSync(sessionLog, snapshotPath);

  enqueueJob({
    type: "scribe",
    payload: { snapshotPath, sessionId, project },
    triggerSource: "session-end",
    idempotencyKey: "scribe:" + snapshotPath,
  });

  enqueueJob({
    type: "observer",
    payload: { snapshotPath, sessionId, project },
    triggerSource: "session-end",
    idempotencyKey: "observer:" + snapshotPath,
  });

  activityBus.log("system:info", "Session end: queued scribe + observer", {
    sessionId,
    project: project || "global",
  });
}

export function cleanupSession(sessionId: string, project: string): void {
  removeActiveProject(sessionId);
  clearSessionContextState(sessionId);
  clearDirty();
}
