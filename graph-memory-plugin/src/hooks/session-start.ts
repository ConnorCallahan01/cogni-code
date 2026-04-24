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
import matter from "gray-matter";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { writeSessionContextState } from "../graph-memory/context-refresh.js";
import { isDirty, markDirty } from "../graph-memory/dirty-state.js";
import { detectProject, writeActiveProject, cleanActiveProjects } from "../graph-memory/project.js";
import { ensureProjectWorkingFile } from "../graph-memory/project-working.js";
import { walkNodes } from "../graph-memory/utils.js";
import { getWorkingInjectionPaths } from "../graph-memory/working-files.js";

interface PinnedNodePayload {
  path: string;
  title: string;
  content: string;
  raw: string;
}

function loadPinnedNodesForProject(projectName: string): PinnedNodePayload[] {
  const pinnedFromIndex: PinnedNodePayload[] = [];

  try {
    const indexPath = CONFIG.paths.index;
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      for (const entry of index) {
        if (!entry?.pinned) continue;
        if (entry.project && entry.project !== projectName) continue;

        const nodePath = path.join(CONFIG.paths.nodes, `${entry.path}.md`);
        if (!fs.existsSync(nodePath)) continue;

        const raw = fs.readFileSync(nodePath, "utf-8");
        const parsed = matter(raw);
        pinnedFromIndex.push({
          path: entry.path,
          title: parsed.data.title || entry.path,
          content: parsed.content.trim(),
          raw,
        });
      }
    }
  } catch {
    // Fall back to direct node scan below.
  }

  if (pinnedFromIndex.length > 0) {
    return pinnedFromIndex;
  }

  const pinnedFromNodes: PinnedNodePayload[] = [];
  for (const { nodePath, filePath } of walkNodes(CONFIG.paths.nodes)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      if (parsed.data.pinned !== true) continue;
      if (parsed.data.project && parsed.data.project !== projectName) continue;
      pinnedFromNodes.push({
        path: nodePath,
        title: parsed.data.title || nodePath,
        content: parsed.content.trim(),
        raw,
      });
    } catch {
      // Skip malformed node files.
    }
  }

  return pinnedFromNodes;
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

  // Inject project context
  if (project.name !== "global") {
    parts.push(`[graph-memory] Active project: ${project.name} (auto-detected)`);
  }

  // 1. Surface crash state, but leave recovery to the background daemon.
  const dirtyCheck = isDirty();
  if (dirtyCheck.dirty) {
    console.error("[graph-memory] Dirty state detected from a previous session. Background daemon should reconcile queued memory work.");
  }

  // 2. Ensure the persistent per-project WORKING file exists before loading context
  try {
    ensureProjectWorkingFile(project.name);
  } catch { /* best effort — fall back to existing WORKING artifacts */ }

  // 3. Load context files in cognitive order
  const contextFiles: Array<{ path: string; emptyMarker: string }> = [
    { path: CONFIG.paths.priors, emptyMarker: "No priors yet" },
    { path: CONFIG.paths.soma, emptyMarker: "No soma markers yet" },
    { path: CONFIG.paths.map, emptyMarker: "No nodes yet" },
    { path: CONFIG.paths.dreamsContext, emptyMarker: "No pending dreams" },
  ];

  for (const { path: filePath, emptyMarker } of contextFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content && !content.includes(emptyMarker)) {
        parts.push(content);
      }
    }
  }

  for (const filePath of getWorkingInjectionPaths(project.name)) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (
        content &&
        !content.includes("No recent activity") &&
        !content.includes("No session handoff captured yet")
      ) {
        parts.push(content);
      }
    }
  }

  // 3b. Load pinned nodes for current project
  try {
    const pinnedEntries = loadPinnedNodesForProject(project.name);
    if (pinnedEntries.length > 0) {
      const sections: string[] = [];
      let totalTokens = 0;
      const maxTokens = CONFIG.graph.maxPinnedTokens;

      for (const entry of pinnedEntries) {
        const nodeTokens = Math.ceil(entry.raw.length / 4);
        if (totalTokens + nodeTokens > maxTokens) continue;
        totalTokens += nodeTokens;
        sections.push(`### ${entry.title}\n\n${entry.content}`);
      }

      if (sections.length > 0) {
        parts.push(`# PINNED — Durable Procedural Memory\n\n> Auto-loaded pinned nodes for this project. Follow these procedures exactly.\n\n${sections.join("\n\n---\n\n")}`);
      }
    }
  } catch { /* non-critical */ }

  if (parts.length === 0) {
    console.log(
      "[graph-memory] Memory initialized but empty. It will grow from your conversations."
    );
  } else {
    // Output to stdout — this gets injected into the agent's context
    console.log(parts.join("\n\n---\n\n"));
  }

  // 4. Mark dirty for this session
  markDirty(sessionId);
  writeSessionContextState(sessionId, project.name);
}

main().catch((err) => {
  console.error(`[graph-memory] Session start hook error: ${err.message}`);
});
