import fs from "fs";
import path from "path";
import { AssistantTraceEvent, AssistantTraceKind } from "./session-trace.js";

const CLAUDE_PROJECTS_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".claude",
  "projects"
);

interface ClaudeAssistantEntry {
  type?: unknown;
  uuid?: unknown;
  parentUuid?: unknown;
  timestamp?: unknown;
  sessionId?: unknown;
  cwd?: unknown;
  message?: {
    stop_reason?: unknown;
    content?: unknown;
  };
}

interface VisibleAssistantTraceResult {
  transcriptPath: string | null;
  events: AssistantTraceEvent[];
}

function sanitizeClaudeProjectDir(projectRoot: string): string {
  return projectRoot.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTextContentItem(value: unknown): value is { type: "text"; text: string } {
  return isObject(value) && value.type === "text" && typeof value.text === "string";
}

function resolveTranscriptPathFromProjectDir(projectRoot: string, sessionId: string): string | null {
  const candidates = new Set<string>([
    path.join(CLAUDE_PROJECTS_ROOT, sanitizeClaudeProjectDir(projectRoot), `${sessionId}.jsonl`),
  ]);

  try {
    candidates.add(path.join(CLAUDE_PROJECTS_ROOT, sanitizeClaudeProjectDir(fs.realpathSync(projectRoot)), `${sessionId}.jsonl`));
  } catch { /* ignore */ }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveClaudeTranscriptPath(projectRoot: string, sessionId: string): string | null {
  if (!projectRoot || !sessionId || !fs.existsSync(CLAUDE_PROJECTS_ROOT)) {
    return null;
  }

  const directMatch = resolveTranscriptPathFromProjectDir(projectRoot, sessionId);
  if (directMatch) {
    return directMatch;
  }

  for (const entry of fs.readdirSync(CLAUDE_PROJECTS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(CLAUDE_PROJECTS_ROOT, entry.name, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeVisibleText(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const textBlocks = content
    .filter(isTextContentItem)
    .map((item) => item.text.trim())
    .filter(Boolean);

  if (textBlocks.length === 0) {
    return null;
  }

  return textBlocks.join("\n\n");
}

function classifyAssistantKind(stopReason: unknown): AssistantTraceKind {
  return stopReason === "end_turn" ? "final" : "intermediate";
}

export function collectVisibleAssistantTrace(
  sessionId: string,
  projectRoot: string,
  options: { project?: string; cwd?: string }
): VisibleAssistantTraceResult {
  const transcriptPath = resolveClaudeTranscriptPath(projectRoot, sessionId);
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { transcriptPath: null, events: [] };
  }

  const events: AssistantTraceEvent[] = [];

  for (const line of fs.readFileSync(transcriptPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;

    let parsed: ClaudeAssistantEntry;
    try {
      parsed = JSON.parse(line) as ClaudeAssistantEntry;
    } catch {
      continue;
    }

    if (parsed.type !== "assistant" || !isObject(parsed.message)) {
      continue;
    }

    const text = normalizeVisibleText(parsed.message.content);
    if (!text) {
      continue;
    }

    const timestamp = typeof parsed.timestamp === "string" ? parsed.timestamp : new Date().toISOString();
    const assistantUuid = typeof parsed.uuid === "string" ? parsed.uuid : undefined;
    const parentUuid = typeof parsed.parentUuid === "string" ? parsed.parentUuid : null;

    events.push({
      type: "assistant_text",
      timestamp,
      sessionId,
      project: options.project,
      cwd: options.cwd,
      kind: classifyAssistantKind(parsed.message.stop_reason),
      text,
      assistantUuid,
      parentUuid,
      source: "claude_session_log",
      transcriptPath,
    });
  }

  return { transcriptPath, events };
}
