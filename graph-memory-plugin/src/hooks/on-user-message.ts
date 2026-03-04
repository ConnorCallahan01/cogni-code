#!/usr/bin/env node
/**
 * UserPromptSubmit hook — captures each user message to the buffer.
 * Also dispatches pending scribes and librarian mid-session (Stop hook stdout
 * is invisible to the agent, so we dispatch here where stdout reaches the agent).
 *
 * Receives JSON on stdin with:
 *   - prompt: the user's message text
 *   - session_id: Claude Code session ID
 *
 * Appends directly to conversation.jsonl.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { markDirty } from "../graph-memory/dirty-state.js";
import { detectProject } from "../graph-memory/project.js";
import { generatePreflightReport } from "../graph-memory/pipeline/preflight.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(__dirname, "../../agents");

async function main() {
  if (!isGraphInitialized()) return;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return;

  let input: { prompt?: string; session_id?: string; cwd?: string };
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  if (!input.prompt) return;

  // Detect project from cwd
  const cwd = input.cwd || process.cwd();
  const project = detectProject(cwd);

  // Ensure buffer directory exists
  const bufferDir = CONFIG.paths.buffer;
  if (!fs.existsSync(bufferDir)) {
    fs.mkdirSync(bufferDir, { recursive: true });
  }

  const maxLen = 2000;
  const content = input.prompt.length > maxLen
    ? input.prompt.slice(0, maxLen) + "..."
    : input.prompt;

  const entry: Record<string, any> = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  if (project.name !== "global") {
    entry.project = project.name;
  }

  fs.appendFileSync(CONFIG.paths.conversationLog, JSON.stringify(entry) + "\n");

  // Keep dirty state fresh
  const sessionId = input.session_id || `session_${Date.now()}`;
  markDirty(sessionId);

  // --- Mid-session scribe dispatch ---
  // The Stop hook writes .scribe-pending but its stdout is invisible to the agent.
  // UserPromptSubmit stdout IS visible, so we dispatch here.
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
        const graphRoot = CONFIG.paths.graphRoot;
        const projectCtx = marker.project ? ` Current project: ${marker.project} (use this for classifying deltas as global vs project-scoped).` : "";
        console.log(`<graph-memory-action>SCRIBE PENDING: Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the scribe instructions at ${scribePromptPath}, then follow them. Snapshot file: ${marker.snapshotPath}, session ID: ${marker.sessionId}, graph root: ${graphRoot}.${projectCtx} Read the snapshot, read MAP.md, then read only the 2-5 existing nodes most relevant to the conversation for context. Extract deltas, write to .deltas/ directory, then remove .scribe-pending marker."</graph-memory-action>`);
      }
    } catch {
      // Unreadable marker — remove it
      try { fs.unlinkSync(CONFIG.paths.scribePending); } catch { /* ignore */ }
    }
  }

  // --- Mid-session dreamer dispatch ---
  // Fires when .dreamer-pending exists (written by librarian after its git commit).
  // Dreamer runs as a separate subagent with a clean context window.
  if (fs.existsSync(CONFIG.paths.dreamerPending)) {
    try {
      const stat = fs.statSync(CONFIG.paths.dreamerPending);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 3600_000) {
        console.error("[graph-memory] Removing stale dreamer-pending marker (>1 hour old).");
        fs.unlinkSync(CONFIG.paths.dreamerPending);
      } else {
        const dreamerPath = path.join(AGENTS_DIR, "memory-dreamer.md");
        const graphRoot = CONFIG.paths.graphRoot;
        console.log(`<graph-memory-action>DREAMER PENDING: Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the dreamer instructions at ${dreamerPath}, then follow them. Graph root: ${graphRoot}."</graph-memory-action>`);
      }
    } catch {
      try { fs.unlinkSync(CONFIG.paths.dreamerPending); } catch { /* ignore */ }
    }
  }

  // --- Mid-session auditor dispatch ---
  // Fires when accumulated deltas reach threshold. Auditor triages, then writes
  // .librarian-pending so the librarian fires next (at next session start or message).
  const lockPath = path.join(CONFIG.paths.graphRoot, ".consolidation.lock");
  let lockActive = false;
  if (fs.existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      const lockAgeSec = Math.floor(Date.now() / 1000) - (lockData.pid_time || 0);
      if (lockAgeSec < 600) {
        lockActive = true;
      } else {
        console.error(`[graph-memory] Removing stale consolidation lock (${lockAgeSec}s old).`);
        fs.unlinkSync(lockPath);
      }
    } catch {
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }
  if (fs.existsSync(CONFIG.paths.deltas) && !lockActive) {
    try {
      const deltaFiles = fs.readdirSync(CONFIG.paths.deltas).filter(f => f.endsWith(".json"));
      if (deltaFiles.length > 0) {
        let totalDeltas = 0;
        for (const f of deltaFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(CONFIG.paths.deltas, f), "utf-8"));
            for (const scribe of data.scribes || []) {
              totalDeltas += (scribe.deltas || []).length;
            }
          } catch { /* skip unreadable files */ }
        }
        if (totalDeltas >= CONFIG.session.librarianDeltaThreshold) {
          const auditorPath = path.join(AGENTS_DIR, "memory-auditor.md");
          const graphRoot = CONFIG.paths.graphRoot;
          // Run preflight report before dispatching auditor
          try {
            generatePreflightReport();
            console.error(`[graph-memory] Preflight report generated at ${CONFIG.paths.preflightReport}`);
          } catch (err: any) {
            console.error(`[graph-memory] Preflight report failed: ${err.message}`);
          }
          console.error(`[graph-memory] ${totalDeltas} deltas accumulated (threshold: ${CONFIG.session.librarianDeltaThreshold}). Dispatching auditor.`);
          console.log(`<graph-memory-action>AUDITOR THRESHOLD REACHED (${totalDeltas} deltas): Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the auditor instructions at ${auditorPath}, then follow them. Graph root: ${graphRoot}. Read the preflight report at ${CONFIG.paths.preflightReport} first — it contains the full node manifest and flagged issues with their file contents included."</graph-memory-action>`);
        }
      }
    } catch {
      // Delta counting failed — not critical, will retry next message
    }
  }

  // --- Mid-session librarian dispatch ---
  // Fires when .librarian-pending exists (written by auditor after triage).
  if (fs.existsSync(CONFIG.paths.librarianPending)) {
    try {
      const stat = fs.statSync(CONFIG.paths.librarianPending);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 3600_000) {
        console.error("[graph-memory] Removing stale librarian-pending marker (>1 hour old).");
        fs.unlinkSync(CONFIG.paths.librarianPending);
      } else if (!lockActive) {
        const librarianPath = path.join(AGENTS_DIR, "memory-librarian.md");
        const graphRoot = CONFIG.paths.graphRoot;
        console.log(`<graph-memory-action>LIBRARIAN PENDING (post-audit): Use the Task tool with subagent_type="general-purpose", model="sonnet", and run_in_background=true. Prompt: "Read the librarian instructions at ${librarianPath}, then follow them. Graph root: ${graphRoot}. Read the audit brief at ${CONFIG.paths.auditBrief} and audit report at ${CONFIG.paths.auditReport} first — the auditor has already triaged mechanical fixes and prepared recommendations for you."</graph-memory-action>`);
      }
    } catch {
      try { fs.unlinkSync(CONFIG.paths.librarianPending); } catch { /* ignore */ }
    }
  }
}

main().catch((err) => {
  console.error(`[graph-memory] on-user-message hook error: ${err.message}`);
  process.exit(0);
});
