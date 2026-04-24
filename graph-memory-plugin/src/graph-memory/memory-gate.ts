import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { getSessionTraceDir, getToolTracePath } from "./session-trace.js";

export interface MemoryGateState {
  sessionId: string;
  project?: string;
  prompt: string;
  required: boolean;
  blockedCount: number;
  requiredAt: string;
  suggestedPaths: string[];
}

function getMemoryGatePath(sessionId: string): string {
  return path.join(getSessionTraceDir(sessionId), "memory-gate.json");
}

function ensureSessionDir(sessionId: string): void {
  const dir = getSessionTraceDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeMemoryGateState(state: MemoryGateState): void {
  ensureSessionDir(state.sessionId);
  fs.writeFileSync(getMemoryGatePath(state.sessionId), JSON.stringify(state, null, 2));
}

export function readMemoryGateState(sessionId: string): MemoryGateState | null {
  const filePath = getMemoryGatePath(sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MemoryGateState;
  } catch {
    return null;
  }
}

export function clearMemoryGateState(sessionId: string): void {
  const filePath = getMemoryGatePath(sessionId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

export function hasGraphMemoryUseSince(sessionId: string, sinceIso: string): boolean {
  const tracePath = getToolTracePath(sessionId);
  if (!fs.existsSync(tracePath)) return false;

  const sinceMs = Date.parse(sinceIso);
  if (Number.isNaN(sinceMs)) return false;

  for (const line of fs.readFileSync(tracePath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { timestamp?: string; toolName?: string };
      const eventMs = parsed.timestamp ? Date.parse(parsed.timestamp) : NaN;
      if (Number.isNaN(eventMs) || eventMs < sinceMs) continue;
      const toolName = String(parsed.toolName || "");
      if (toolName.includes("graph-memory")) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export function buildMemoryGateReason(state: MemoryGateState): string {
  const suggested = state.suggestedPaths.length > 0
    ? `Start with graph_memory(search/recall) and, if relevant, read_node on ${state.suggestedPaths.slice(0, 3).join(", ")}.`
    : "Start with graph_memory(search/recall) and read the most relevant node(s) before finalizing.";
  return `Memory likely matters for this prompt. Before stopping, consult graph_memory for repo/global memory relevant to "${state.prompt.slice(0, 140)}". ${suggested}`;
}

export function buildUserPromptAdditionalContext(contextBlocks: string[]): string {
  const body = contextBlocks.filter(Boolean).join("\n\n");
  return [
    "<graph-memory-hook>",
    "Before answering, check whether graph memory already contains a relevant prior, procedure, working note, or project node for this request.",
    "If the recalled memory below looks relevant, use graph_memory(recall/search/read_node) before finalizing your answer.",
    "",
    body,
    "</graph-memory-hook>",
  ].filter(Boolean).join("\n");
}
