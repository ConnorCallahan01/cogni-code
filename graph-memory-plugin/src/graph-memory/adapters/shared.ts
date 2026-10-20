import { CONFIG } from "../config.js";
import { detectProject, ProjectInfo, writeActiveProject, cleanActiveProjects, removeActiveProject, readActiveProject } from "../project.js";
import { hasMentalModelData, buildSessionStartContext as buildModelContext } from "../session-start-context.js";
import { isDirty, markDirty, clearDirty } from "../dirty-state.js";
import { writeSessionContextState, clearSessionContextState } from "../context-refresh.js";
import { ensureProjectWorkingFile, renderWorkingForSession } from "../project-working.js";
import { enqueueJob } from "../pipeline/job-queue.js";
import { activityBus } from "../events.js";
import { buildProjectMap, loadPinnedNodes, mapHeader, renderPinnedSection } from "../context-sections.js";
import fs from "fs";
import path from "path";

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

  if (hasMentalModelData()) {
    const ctx = buildModelContext(project.name, sessionId);
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

export function buildFallbackInjection(project: ProjectInfo, sessionId?: string): string {
  const maxSessionTokens = CONFIG.graph.maxSessionStartTokens || 15000;
  const globalBudget = 4000;
  const projectBudget = maxSessionTokens - globalBudget;
  const parts: string[] = [];

  const dirtyCheck = isDirty();
  if (dirtyCheck.dirty) {
    parts.push("[graph-memory] Dirty state from a previous session. Background daemon should reconcile.");
  }

  try { ensureProjectWorkingFile(project.name); } catch { /* ok */ }

  const modelPath = path.join(CONFIG.paths.graphRoot, "mind", "model.json");
  try {
    if (fs.existsSync(modelPath)) {
      const modelFile = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
      if (modelFile?.model) {
        const m = modelFile.model;
        const block: string[] = [];
        if (m.guardrails?.length > 0) {
          block.push("## Guardrails\n");
          for (const g of m.guardrails) block.push("- " + g);
        }
        if (m.cognitiveStyle) block.push("\n## Style\n\n" + m.cognitiveStyle);
        if (m.decisionPatterns?.length > 0) {
          block.push("\n## Decision Patterns\n");
          for (const d of m.decisionPatterns) block.push("- " + d);
        }
        if (m.preferences?.length > 0) {
          block.push("\n## Preferences\n");
          for (const p of m.preferences) block.push("- " + p);
        }
        if (m.emotionalProfile) block.push("\n## Engagement\n\n" + m.emotionalProfile);
        if (m.relationalNotes?.length > 0) {
          block.push("\n## Relational Notes\n");
          for (const n of m.relationalNotes) block.push("- " + n);
        }
        if (block.length > 0) {
          parts.push("# Operational Context\n\n" + block.join("\n"));
        }
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
    const content = renderWorkingForSession(project.name, sessionId);
    if (content) parts.push("## PROJECT WORKING\n\n" + content);
  }

  if (fs.existsSync(CONFIG.paths.index)) {
    try {
      const projectMAP = buildProjectMap(project.name, 5000 * 4);
      if (projectMAP) parts.push("## MAP\n\n" + projectMAP);
    } catch { /* skip */ }
  }

  return parts.join("\n\n");
}

export function buildFullInjection(project: ProjectInfo, sessionId?: string): string {
  const maxSessionTokens = CONFIG.graph.maxSessionStartTokens || 15000;
  const parts: string[] = [];
  let totalTokens = 0;

  if (isDirty().dirty) {
    parts.push("[graph-memory] Dirty state from a previous session. Background daemon should reconcile.");
  }

  try { ensureProjectWorkingFile(project.name); } catch { /* ok */ }

  let whisperPrefix = "";
  if (hasMentalModelData()) {
    try {
      const ctx = buildModelContext(project.name, sessionId);
      if (!ctx.sources.fallback && ctx.context) {
        whisperPrefix = ctx.context;
        totalTokens += ctx.tokensUsed;
      }
    } catch { /* fall through */ }
  }

  if (!whisperPrefix) {
    const modelPath = path.join(CONFIG.paths.graphRoot, "mind", "model.json");
    if (fs.existsSync(modelPath)) {
      try {
        const modelData = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
        const model = modelData.model || modelData;
        if (model.cognitiveStyle || model.guardrails?.length) {
          const block = renderModelBlock(model);
          const tokens = Math.ceil(block.length / 4);
          if (totalTokens + tokens <= maxSessionTokens) {
            whisperPrefix = block;
            totalTokens += tokens;
          }
        }
      } catch { /* fall through */ }
    }
  }

  const mapBudget = Math.min(CONFIG.graph.maxMapInjectionTokens || 5000, maxSessionTokens - totalTokens);
  const projectMAP = buildProjectMap(project.name, mapBudget * 4);
  if (projectMAP) {
    const tokens = Math.ceil(projectMAP.length / 4);
    if (totalTokens + tokens <= maxSessionTokens) {
      parts.push(mapHeader(project.name) + "\n\n" + projectMAP);
      totalTokens += tokens;
    }
  }

  if (fs.existsSync(CONFIG.paths.dreamsContext)) {
    const dreams = fs.readFileSync(CONFIG.paths.dreamsContext, "utf-8").trim();
    if (dreams && !dreams.includes("No pending dreams")) {
      const tokens = Math.ceil(dreams.length / 4);
      if (totalTokens + tokens <= maxSessionTokens) {
        parts.push(dreams);
        totalTokens += tokens;
      }
    }
  }

  const working = renderWorkingForSession(project.name, sessionId);
  if (working) {
    const tokens = Math.ceil(working.length / 4);
    if (totalTokens + tokens <= maxSessionTokens) {
      parts.push(working);
      totalTokens += tokens;
    }
  }

  try {
    const pinnedBudget = Math.min(CONFIG.graph.maxPinnedTokens, maxSessionTokens - totalTokens) * 4;
    const pinnedBlock = renderPinnedSection(loadPinnedNodes(project.name), pinnedBudget);
    if (pinnedBlock) {
      totalTokens += Math.ceil(pinnedBlock.length / 4);
      parts.push(pinnedBlock);
    }
  } catch { /* non-critical */ }

  const allParts = whisperPrefix ? [whisperPrefix, ...parts] : parts;
  return allParts.join("\n\n---\n\n");
}

function renderModelBlock(model: Record<string, unknown>): string {
  const lines: string[] = ["# Mental Model", ""];

  if (model.cognitiveStyle && typeof model.cognitiveStyle === "string") {
    lines.push("## Thinking Style", "");
    lines.push(model.cognitiveStyle);
    lines.push("");
  }

  const guardrails = model.guardrails;
  if (Array.isArray(guardrails) && guardrails.length > 0) {
    lines.push("## Guardrails", "");
    for (const g of guardrails) lines.push("- " + g);
    lines.push("");
  }

  const preferences = model.preferences;
  if (Array.isArray(preferences) && preferences.length > 0) {
    lines.push("## Preferences", "");
    for (const p of preferences) lines.push("- " + p);
    lines.push("");
  }

  const decisionPatterns = model.decisionPatterns;
  if (Array.isArray(decisionPatterns) && decisionPatterns.length > 0) {
    lines.push("## Decision Patterns", "");
    for (const d of decisionPatterns) lines.push("- " + d);
    lines.push("");
  }

  if (model.emotionalProfile && typeof model.emotionalProfile === "string") {
    lines.push("## Engagement Profile", "");
    lines.push(model.emotionalProfile);
    lines.push("");
  }

  const relationalNotes = model.relationalNotes;
  if (Array.isArray(relationalNotes) && relationalNotes.length > 0) {
    for (const n of relationalNotes) lines.push("- " + n);
    lines.push("");
  }

  return lines.join("\n");
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
