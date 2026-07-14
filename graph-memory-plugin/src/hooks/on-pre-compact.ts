#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { initializeGraph } from "../graph-memory/index.js";
import { detectProject, readActiveProject } from "../graph-memory/project.js";
import { enqueueJob } from "../graph-memory/pipeline/job-queue.js";
import { getConversationLogPath } from "../graph-memory/session-trace.js";
import { activityBus } from "../graph-memory/events.js";

async function main() {
  if (process.env.GRAPH_MEMORY_PIPELINE_CHILD === "1" || process.env.GRAPH_MEMORY_WORKER === "1") return;
  if (!isGraphInitialized()) return;

  let sessionId: string | undefined;
  let cwd: string | undefined;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    if (raw) {
      const input = JSON.parse(raw);
      sessionId = input.session_id;
      cwd = input.cwd;
    }
  } catch { /* ignore */ }

  initializeGraph();
  const resolvedSessionId = sessionId || `compact_${Date.now()}`;
  let activeProject = readActiveProject(sessionId);
  if (!activeProject) {
    activeProject = detectProject(cwd || process.cwd());
  }
  const project = activeProject?.name || "global";

  const logPath = getConversationLogPath(resolvedSessionId);
  if (fs.existsSync(logPath)) {
    const snapshotName = `snapshot_${Date.now()}.jsonl`;
    const snapshotPath = path.join(CONFIG.paths.buffer, snapshotName);
    fs.renameSync(logPath, snapshotPath);

    enqueueJob({
      type: "scribe",
      payload: { snapshotPath, sessionId: resolvedSessionId, ...(project !== "global" ? { project } : {}) },
      triggerSource: "hook:pre-compact",
      idempotencyKey: `scribe:${snapshotPath}`,
    });
    enqueueJob({
      type: "observer",
      payload: { snapshotPath, sessionId: resolvedSessionId, ...(project !== "global" ? { project } : {}) },
      triggerSource: "hook:pre-compact",
      idempotencyKey: `observer:${snapshotPath}`,
    });

    activityBus.log("system:info", "Pre-compact: buffer flushed, scribe + observer queued", {
      sessionId: resolvedSessionId,
      project,
    });
    console.error(`[graph-memory] Pre-compact: buffer flushed, scribe + observer queued (${project}).`);
  }
}

main().catch((err) => {
  console.error(`[graph-memory] Pre-compact hook error: ${err.message}`);
  process.exit(0);
});
