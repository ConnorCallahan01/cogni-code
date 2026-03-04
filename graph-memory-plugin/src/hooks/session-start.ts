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
import { fileURLToPath } from "url";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { isDirty, clearDirty, markDirty, setConsolidationPending, isConsolidationPending } from "../graph-memory/dirty-state.js";
import { applyDeltas } from "../graph-memory/pipeline/mechanical-apply.js";
import { regenerateAllContextFiles } from "../graph-memory/pipeline/graph-ops.js";
import { generatePreflightReport } from "../graph-memory/pipeline/preflight.js";
import { detectProject, writeActiveProject, cleanActiveProjects } from "../graph-memory/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Plugin root: dist/hooks/ -> ../../agents/
const AGENTS_DIR = path.resolve(__dirname, "../../agents");

async function main() {
  if (!isGraphInitialized()) {
    console.log(
      "[graph-memory] Memory not initialized. Run /graph-memory:memory-onboard to set up."
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

  // 1. Crash recovery: check dirty state from previous session
  const dirtyCheck = isDirty();
  if (dirtyCheck.dirty) {
    console.error("[graph-memory] Dirty state detected — previous session didn't exit cleanly. Recovering...");
    try {
      // Process any orphaned deltas
      const deltasDir = CONFIG.paths.deltas;
      if (fs.existsSync(deltasDir)) {
        const deltaFiles = fs.readdirSync(deltasDir).filter(f => f.endsWith(".json"));
        for (const f of deltaFiles) {
          const sessionId = f.replace(".json", "");
          try {
            await applyDeltas(sessionId);
          } catch { /* best effort */ }
        }
      }
      regenerateAllContextFiles();
      clearDirty();
      setConsolidationPending("crash recovery");
      console.error("[graph-memory] Crash recovery complete. Consolidation pending.");
    } catch (err: any) {
      console.error(`[graph-memory] Crash recovery failed: ${err.message}`);
      clearDirty();
    }
  }

  // 2. Check for scribe-pending marker (with staleness check)
  if (fs.existsSync(CONFIG.paths.scribePending)) {
    try {
      const stat = fs.statSync(CONFIG.paths.scribePending);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 3600_000) {
        // Stale marker (>1 hour) — clean up
        console.error("[graph-memory] Removing stale scribe-pending marker (>1 hour old).");
        fs.unlinkSync(CONFIG.paths.scribePending);
      } else {
        const marker = JSON.parse(fs.readFileSync(CONFIG.paths.scribePending, "utf-8"));
        const scribePromptPath = path.join(AGENTS_DIR, "memory-scribe.md");
        const projectCtx = marker.project ? ` Current project: ${marker.project} (use this for classifying deltas as global vs project-scoped).` : "";
        parts.push(`<graph-memory-action>SCRIBE PENDING: Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the scribe instructions at ${scribePromptPath}, then follow them. Snapshot file: ${marker.snapshotPath}, session ID: ${marker.sessionId}, graph root: ${graphRoot}.${projectCtx} Read the snapshot, read MAP.md, then read only the 2-5 existing nodes most relevant to the conversation for context. Extract deltas, write to .deltas/ directory, then remove .scribe-pending marker."</graph-memory-action>`);
      }
    } catch {
      // Unreadable marker — remove it
      try { fs.unlinkSync(CONFIG.paths.scribePending); } catch { /* ignore */ }
    }
  }

  // 3. Check for librarian-pending (written by auditor after triage)
  if (fs.existsSync(CONFIG.paths.librarianPending)) {
    try {
      const stat = fs.statSync(CONFIG.paths.librarianPending);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 3600_000) {
        console.error("[graph-memory] Removing stale librarian-pending marker (>1 hour old).");
        fs.unlinkSync(CONFIG.paths.librarianPending);
      } else {
        const librarianPath = path.join(AGENTS_DIR, "memory-librarian.md");
        parts.push(`<graph-memory-action>LIBRARIAN PENDING (post-audit): Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the librarian instructions at ${librarianPath}, then follow them. Graph root: ${graphRoot}. Read the audit brief at ${CONFIG.paths.auditBrief} and audit report at ${CONFIG.paths.auditReport} first — the auditor has already triaged mechanical fixes and prepared recommendations for you."</graph-memory-action>`);
      }
    } catch {
      try { fs.unlinkSync(CONFIG.paths.librarianPending); } catch { /* ignore */ }
    }
  }

  // 4. Check for dreamer-pending (written by librarian after its commit)
  if (fs.existsSync(CONFIG.paths.dreamerPending)) {
    try {
      const stat = fs.statSync(CONFIG.paths.dreamerPending);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 3600_000) {
        console.error("[graph-memory] Removing stale dreamer-pending marker (>1 hour old).");
        fs.unlinkSync(CONFIG.paths.dreamerPending);
      } else {
        const dreamerPath = path.join(AGENTS_DIR, "memory-dreamer.md");
        parts.push(`<graph-memory-action>DREAMER PENDING: Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the dreamer instructions at ${dreamerPath}, then follow them. Graph root: ${graphRoot}."</graph-memory-action>`);
      }
    } catch {
      try { fs.unlinkSync(CONFIG.paths.dreamerPending); } catch { /* ignore */ }
    }
  }

  // 5. Check for consolidation-pending (dispatches auditor, not librarian directly)
  const consolidation = isConsolidationPending();
  if (consolidation.pending) {
    const lockPath = path.join(graphRoot, ".consolidation.lock");
    let lockHeld = false;
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
        const lockAgeSec = Math.floor(Date.now() / 1000) - (lockData.pid_time || 0);
        if (lockAgeSec < 600) {
          lockHeld = true;
          console.error(`[graph-memory] Consolidation lock held (${lockAgeSec}s old). Skipping auditor dispatch.`);
        } else {
          console.error(`[graph-memory] Removing stale consolidation lock (${lockAgeSec}s old).`);
          fs.unlinkSync(lockPath);
        }
      } catch {
        try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
      }
    }
    if (!lockHeld) {
      const auditorPath = path.join(AGENTS_DIR, "memory-auditor.md");
      // Run preflight report before dispatching auditor
      try {
        generatePreflightReport();
        console.error(`[graph-memory] Preflight report generated at ${CONFIG.paths.preflightReport}`);
      } catch (err: any) {
        console.error(`[graph-memory] Preflight report failed: ${err.message}`);
      }
      parts.push(`<graph-memory-action>CONSOLIDATION PENDING (${consolidation.summary || "session end"}): Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the auditor instructions at ${auditorPath}, then follow them. Graph root: ${graphRoot}. Read the preflight report at ${CONFIG.paths.preflightReport} first — it contains the full node manifest and flagged issues with their file contents included."</graph-memory-action>`);
    }
  }

  // 6. Load context files in cognitive order
  const contextFiles: Array<{ path: string; emptyMarker: string }> = [
    { path: CONFIG.paths.priors, emptyMarker: "No priors yet" },
    { path: CONFIG.paths.soma, emptyMarker: "No soma markers yet" },
    { path: CONFIG.paths.map, emptyMarker: "No nodes yet" },
    { path: CONFIG.paths.working, emptyMarker: "No recent activity" },
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

  if (parts.length === 0) {
    console.log(
      "[graph-memory] Memory initialized but empty. It will grow from your conversations."
    );
  } else {
    // Output to stdout — this gets injected into the agent's context
    console.log(parts.join("\n\n---\n\n"));
  }

  // 8. Mark dirty for this session
  markDirty(sessionId);
}

main().catch((err) => {
  console.error(`[graph-memory] Session start hook error: ${err.message}`);
});
