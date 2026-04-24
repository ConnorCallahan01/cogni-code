#!/usr/bin/env node
import { isGraphInitialized } from "../graph-memory/config.js";
import { detectProject } from "../graph-memory/project.js";
import { appendToolTrace } from "../graph-memory/session-trace.js";

async function main() {
  if (process.env.GRAPH_MEMORY_PIPELINE_CHILD === "1" || process.env.GRAPH_MEMORY_WORKER === "1") return;
  if (!isGraphInitialized()) return;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return;

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const sessionId = typeof input.session_id === "string" ? input.session_id : `session_${Date.now()}`;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const project = detectProject(cwd);
  appendToolTrace(sessionId, "pre", input, { project: project.name, cwd });
}

main().catch((err) => {
  console.error(`[graph-memory] on-pre-tool-use hook error: ${err.message}`);
  process.exit(0);
});
