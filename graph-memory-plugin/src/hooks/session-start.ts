#!/usr/bin/env node
/**
 * Session start hook — loads MAP and PRIORS into agent context.
 * Also handles crash recovery, scribe-pending, and consolidation-pending signals.
 *
 * Called by Claude Code at conversation start via hooks.json.
 * Outputs to stdout which gets injected into the agent's context.
 */
import fs from "fs";
import path from "path";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { writeSessionContextState } from "../graph-memory/context-refresh.js";
import { isDirty, markDirty } from "../graph-memory/dirty-state.js";
import { detectProject, writeActiveProject, cleanActiveProjects } from "../graph-memory/project.js";
import { ensureProjectWorkingFile } from "../graph-memory/project-working.js";
import { CLAUDE_HOOK_OUTPUT_CHAR_CAP, SECTION_SEPARATOR, buildProjectMap, loadPinnedNodes, mapHeader, renderPinnedSection } from "../graph-memory/context-sections.js";
import { getWorkingInjectionPaths } from "../graph-memory/working-files.js";
import { buildSessionStartContext, hasMentalModelData } from "../graph-memory/session-start-context.js";
import { getAntiPatterns } from "../graph-memory/pipeline/graph-index.js";
import { ensureLens, readModel as readProjectModel, lensExists } from "../graph-memory/lenses/manager.js";
import { readRecentSessions } from "../graph-memory/sessions/manager.js";
import { getProjectWorkingStatePath } from "../graph-memory/working-files.js";

// Pinned nodes get at most this share of the injection, and each node is
// clipped to its head (the rule) so one node's accreted history can't crowd
// out the rest.
const PINNED_SHARE = 0.35;
const PINNED_NODE_MAX_CHARS = 1500;

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
    for (const g of guardrails) {
      lines.push(`- ${g}`);
    }
    lines.push("");
  }

  const preferences = model.preferences;
  if (Array.isArray(preferences) && preferences.length > 0) {
    lines.push("## Preferences", "");
    for (const p of preferences) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  const decisionPatterns = model.decisionPatterns;
  if (Array.isArray(decisionPatterns) && decisionPatterns.length > 0) {
    lines.push("## Decision Patterns", "");
    for (const d of decisionPatterns) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  if (model.emotionalProfile && typeof model.emotionalProfile === "string") {
    lines.push("## Engagement Profile", "");
    lines.push(model.emotionalProfile);
    lines.push("");
  }

  const relationalNotes = model.relationalNotes;
  if (Array.isArray(relationalNotes) && relationalNotes.length > 0) {
    for (const n of relationalNotes) {
      lines.push(`- ${n}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  if (process.env.GRAPH_MEMORY_PIPELINE_CHILD === "1" || process.env.GRAPH_MEMORY_WORKER === "1") {
    return;
  }

  if (!isGraphInitialized()) {
    console.log(
      "[graph-memory] Memory not initialized. Run /memory-onboard to set up."
    );
    return;
  }

  // Read stdin for cwd and session_id
  let cwd = process.cwd();
  let sessionId = `session_${Date.now()}`;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    if (raw) {
      const input = JSON.parse(raw);
      if (input.cwd) cwd = input.cwd;
      if (input.session_id) sessionId = input.session_id;
    }
  } catch { /* use defaults */ }

  // Detect and register active project
  const project = detectProject(cwd);
  writeActiveProject(sessionId, { name: project.name, gitRoot: project.gitRoot, cwd });
  cleanActiveProjects();

  const parts: string[] = [];
  const graphRoot = CONFIG.paths.graphRoot;

  const dirtyCheck = isDirty();
  if (dirtyCheck.dirty) {
    console.error("[graph-memory] Dirty state detected from a previous session. Background daemon should reconcile queued memory work.");
  }

  try {
    ensureProjectWorkingFile(project.name);
  } catch { /* best effort */ }

  // The whole injection has to fit under Claude Code's hook output cap, or the
  // agent only ever sees a 2,000-character preview. Sections are added in
  // priority order, and a section that doesn't fit what's left is skipped.
  const maxChars = Math.min(CLAUDE_HOOK_OUTPUT_CHAR_CAP - 500, (CONFIG.graph.maxSessionStartTokens || 8000) * 4);
  let usedChars = 0;
  const remainingChars = () => maxChars - usedChars - (parts.length > 0 ? SECTION_SEPARATOR.length : 0);
  const addPart = (block: string | null | undefined): boolean => {
    if (!block || block.length > remainingChars()) return false;
    usedChars += block.length + (parts.length > 0 ? SECTION_SEPARATOR.length : 0);
    parts.push(block);
    return true;
  };

  if (project.name !== "global") {
    addPart(`[graph-memory] Active project: ${project.name} (auto-detected)`);
  }

  // 1. Guardrails (actionable directives, must come first)
  if (hasMentalModelData()) {
    try {
      const modelPath = path.join(graphRoot, "mind", "model.json");
      if (fs.existsSync(modelPath)) {
        const modelData = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
        const model = modelData.model || modelData;
        const gLines: string[] = [];
        if (model.guardrails?.length) {
          gLines.push("## Guardrails");
          for (const g of model.guardrails) gLines.push("- " + g);
        }
        const ap = getAntiPatterns(project.name !== "global" ? project.name : undefined);
        if (ap.length > 0) {
          gLines.push("## Anti-Patterns");
          for (const a of ap) gLines.push("- " + a.gist);
        }
        if (gLines.length > 0) addPart(gLines.join("\n"));
      }
    } catch { /* fall through */ }
  }

  // 2. WORKING (project handoff — most actionable per-session content)
  let workingInjected = false;
  for (const filePath of getWorkingInjectionPaths(project.name)) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content && !content.includes("No recent activity") && !content.includes("No session handoff captured yet")) {
        if (addPart(content)) workingInjected = true;
      }
    }
  }

  // 3. PINNED (procedural memory — follow these procedures exactly)
  try {
    const pinnedBudget = Math.min(CONFIG.graph.maxPinnedTokens * 4, Math.floor(maxChars * PINNED_SHARE), remainingChars());
    addPart(renderPinnedSection(loadPinnedNodes(project.name), pinnedBudget, PINNED_NODE_MAX_CHARS));
  } catch { /* non-critical */ }

  // 4. Mental model reference (style, preferences, engagement)
  if (hasMentalModelData()) {
    try {
      const modelPath = path.join(graphRoot, "mind", "model.json");
      if (fs.existsSync(modelPath)) {
        const modelData = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
        const model = modelData.model || modelData;
        const refLines: string[] = [];
        if (model.cognitiveStyle) refLines.push("## Style\n\n" + model.cognitiveStyle);
        if (model.decisionPatterns?.length) {
          refLines.push("## Decision Patterns");
          for (const d of model.decisionPatterns) refLines.push("- " + d);
        }
        if (model.preferences?.length) {
          refLines.push("## Preferences");
          for (const p of model.preferences) refLines.push("- " + p);
        }
        if (model.emotionalProfile) refLines.push("## Engagement\n\n" + model.emotionalProfile);
        if (model.relationalNotes?.length) {
          refLines.push("## Relational Notes");
          for (const n of model.relationalNotes) refLines.push("- " + n);
        }
        addPart(refLines.join("\n\n"));
      }
    } catch { /* fall through */ }
  }

  // 5. Project model + session log + pickup
  if (project.name !== "global") {
    if (!lensExists(project.name)) {
      try { ensureLens(project.name); } catch { /* best effort */ }
    }
    try {
      const projectFile = readProjectModel(project.name);
      if (projectFile?.model) {
        const pLines: string[] = [];
        const pm = projectFile.model;
        if (pm.techStack?.length) { pLines.push("## Tech Stack"); for (const t of pm.techStack) pLines.push("- " + t); }
        if (pm.conventions?.length) { pLines.push("## Conventions"); for (const c of pm.conventions) pLines.push("- " + c); }
        if (pm.procedures?.length) { pLines.push("## Procedures"); for (const p of pm.procedures) pLines.push("- " + p); }
        if (pm.guardrails?.length) { pLines.push("## Project Guardrails"); for (const g of pm.guardrails) pLines.push("- " + g); }
        if (pm.activeWork?.length) { pLines.push("## Active Work"); for (const a of pm.activeWork) pLines.push("- " + a); }
        if (pm.openThreads?.length) { pLines.push("## Open Threads"); for (const o of pm.openThreads) pLines.push("- " + o); }
        addPart(pLines.join("\n\n"));
      }
    } catch { /* fall through */ }

    try {
      const recentSessions = readRecentSessions(project.name, 1);
      if (recentSessions.length > 0) {
        const log = recentSessions[0];
        const sLines: string[] = ["## Last Session", ""];
        const date = log.timestamp.slice(0, 10);
        sLines.push("**" + date + "**");
        if (log.openThreads.length > 0) sLines.push("Open: " + log.openThreads.join("; "));
        if (log.nextSessionShould) sLines.push("Next: " + log.nextSessionShould);
        const sBlock = sLines.join("\n").trim();
        if (sBlock !== "## Last Session") addPart(sBlock);
      }
    } catch { /* fall through */ }

    // WORKING's "Now" section already lists these.
    if (!workingInjected) {
      try {
        const statePath = getProjectWorkingStatePath(project.name);
        if (fs.existsSync(statePath)) {
          const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
          const latest = state.sessions?.[0];
          if (latest?.nextPickup?.length) {
            const items = latest.nextPickup.slice(0, 3);
            const pkLines = ["## Pick Up", ""];
            for (const item of items) pkLines.push("- " + item);
            addPart(pkLines.join("\n"));
          }
        }
      } catch { /* fall through */ }
    }
  }

  // 6. MAP (knowledge graph index — gets what's left)
  try {
    const header = mapHeader(project.name);
    const mapBudget = Math.min((CONFIG.graph.maxMapInjectionTokens || 5000) * 4, remainingChars()) - header.length - 2;
    const body = mapBudget > 0 ? buildProjectMap(project.name, mapBudget) : null;
    if (body) addPart(`${header}\n\n${body}`);
  } catch { /* non-critical */ }

  // 7. DREAMS (speculative, lowest priority)
  if (fs.existsSync(CONFIG.paths.dreamsContext)) {
    const dreams = fs.readFileSync(CONFIG.paths.dreamsContext, "utf-8").trim();
    if (dreams && !dreams.includes("No pending dreams")) addPart(dreams);
  }

  if (parts.length === 0) {
    process.stdout.write("[graph-memory] Memory initialized but empty. It will grow from your conversations.\n");
  } else {
    process.stdout.write(parts.join(SECTION_SEPARATOR));
    process.stdout.write("\n");
  }

  console.error(`[graph-memory] Injection: ${usedChars}/${maxChars} chars (guardrails→working→pinned→reference→project→map→dreams)`)

  // 4. Mark dirty for this session
  markDirty(sessionId);
  writeSessionContextState(sessionId, project.name);
}

main().catch((err) => {
  console.error(`[graph-memory] Session start hook error: ${err.message}`);
});
