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
 * Appends to the per-session conversation buffer.
 */
import fs from "fs";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { diffSessionContextState, readArtifactContent, RefreshArtifact, writeSessionContextState } from "../graph-memory/context-refresh.js";
import { markDirty } from "../graph-memory/dirty-state.js";
import { detectProject } from "../graph-memory/project.js";
import { buildUserPromptAdditionalContext, clearMemoryGateState, writeMemoryGateState } from "../graph-memory/memory-gate.js";
import { getConversationLogPath } from "../graph-memory/session-trace.js";
import { overlap, recencyBoost, projectBoost } from "../graph-memory/scoring.js";
import { somaBoost } from "../graph-memory/soma.js";

// ~40 common English stopwords — filtered from user message before scoring
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "but", "or",
  "and", "not", "no", "so", "if", "then", "than", "that", "this", "it",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "they",
  "what", "how", "when", "where", "why", "which", "who", "whom",
]);

/**
 * Ambient auto-recall: extract keywords from user message, score against
 * .index.json, return top matching node gists as context. Pure keyword
 * matching — no LLM, no network, <5ms for ~100 nodes.
 */
interface AmbientRecallResult {
  context: string | null;
  shouldRequireLookup: boolean;
  suggestedPaths: string[];
}

const EXPLICIT_MEMORY_PATTERNS: RegExp[] = [
  /\bremember\b/i,
  /\brecall\b/i,
  /\bfrom memory\b/i,
  /\bcheck (?:your|the) memory\b/i,
  /\bdive deep into (?:your|the) memory\b/i,
  /\buse (?:your|the) memory\b/i,
];

const CONTINUITY_PATTERNS: RegExp[] = [
  /\bwhat was\b/i,
  /\bwhat were\b/i,
  /\bagain\b/i,
  /\bcurrently\b/i,
  /\bpreviously\b/i,
  /\bwe just\b/i,
  /\bresume\b/i,
  /\bcontinue\b/i,
  /\btest checklist\b/i,
  /\bnext step\b/i,
];

const PREFERENCE_PATTERNS: RegExp[] = [
  /\bhow i like\b/i,
  /\bi prefer\b/i,
  /\bmy preference\b/i,
  /\bstyle of (?:this )?repo(?:sitory)?\b/i,
  /\bworkflow\b/i,
  /\bprocess(?:es)?\b/i,
  /\bskills?\b/i,
];

const REPO_OPERATING_CONTEXT_PATTERNS: RegExp[] = [
  /\bclaude\.md\b/i,
  /\bthis repo(?:sitory)?\b/i,
  /\bbranch\b/i,
  /\bworking(?:\.md)?\b/i,
  /\bpriors\b/i,
  /\bmorning brief\b/i,
];

function pathCategory(pathValue: string): string {
  return pathValue.split("/")[0] || "";
}

function categoryGateWeight(pathValue: string): number {
  const category = pathCategory(pathValue);
  switch (category) {
    case "preferences":
    case "patterns":
    case "decisions":
    case "projects":
    case "procedures":
    case "people":
    case "architecture":
    case "concepts":
    case "tools":
      return 1.25;
    case "dreams":
      return 0.55;
    default:
      return 1.0;
  }
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function ambientRecall(userMessage: string, currentProject?: string): AmbientRecallResult {
  const indexPath = CONFIG.paths.index;
  if (!fs.existsSync(indexPath)) {
    return { context: null, shouldRequireLookup: false, suggestedPaths: [] };
  }

  const normalizedMessage = userMessage.toLowerCase();

  // Tokenize and filter stopwords
  const tokens = userMessage.toLowerCase().split(/\s+/)
    .map(t => t.replace(/[^a-z0-9-]/g, ""))
    .filter(t => t.length > 1 && !STOPWORDS.has(t));

  if (tokens.length < 2) {
    return { context: null, shouldRequireLookup: false, suggestedPaths: [] };
  }

  let index: any[];
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch {
    return { context: null, shouldRequireLookup: false, suggestedPaths: [] };
  }
  if (!Array.isArray(index) || index.length === 0) {
    return { context: null, shouldRequireLookup: false, suggestedPaths: [] };
  }

  // Score all entries
  const scored = index
    .map((entry: any) => {
      const gistTokens = (entry.gist || "").toLowerCase().split(/\s+/);
      const tagTokens = (entry.tags || []).map((t: any) => String(t).toLowerCase());
      const keywordTokens = (entry.keywords || []).map((k: any) => String(k).toLowerCase());
      // Also match against path segments (e.g. "librarian" in "architecture/graph-memory/librarian")
      const pathTokens = (entry.path || "").toLowerCase().split(/[\/\-_]/);

      const gistScore = overlap(tokens, gistTokens) * 3;
      const tagScore = overlap(tokens, tagTokens) * 2;
      const keywordScore = overlap(tokens, keywordTokens) * 1;
      const pathScore = overlap(tokens, pathTokens) * 1.5;

      const baseRelevance = (gistScore + tagScore + keywordScore + pathScore) * (entry.confidence || 0.5);
      const relevance = baseRelevance
        * recencyBoost(entry.last_accessed)
        * somaBoost(entry.soma_intensity || 0)
        * projectBoost(entry.project, currentProject)
        * categoryGateWeight(entry.path || "");

      return { path: entry.path, gist: entry.gist, relevance };
    })
    .filter((e: any) => e.relevance > 0.15)
    .sort((a: any, b: any) => b.relevance - a.relevance)
    .slice(0, 3);

  if (scored.length === 0) {
    return { context: null, shouldRequireLookup: false, suggestedPaths: [] };
  }

  const lines = scored.map((r: any) =>
    `- **${r.path}** (${r.relevance.toFixed(2)}): ${(r.gist || "").slice(0, 150)}`
  );

  const topRelevance = scored[0]?.relevance || 0;
  const strongMatches = scored.filter((entry: any) => entry.relevance >= 0.25).length;
  const explicitMemoryHits = countMatches(normalizedMessage, EXPLICIT_MEMORY_PATTERNS);
  const continuityHits = countMatches(normalizedMessage, CONTINUITY_PATTERNS);
  const preferenceHits = countMatches(normalizedMessage, PREFERENCE_PATTERNS);
  const repoContextHits = countMatches(normalizedMessage, REPO_OPERATING_CONTEXT_PATTERNS);
  const intentScore = (explicitMemoryHits * 3) + (continuityHits * 2) + (preferenceHits * 2) + repoContextHits;
  const topCategory = pathCategory(scored[0]?.path || "");
  const favoredCategory = ["preferences", "patterns", "decisions", "projects", "procedures", "architecture", "concepts"].includes(topCategory);
  const shouldRequireLookup =
    explicitMemoryHits > 0 ||
    (intentScore >= 3 && topRelevance >= 0.22) ||
    (intentScore >= 2 && strongMatches >= 2) ||
    (favoredCategory && topRelevance >= 0.38) ||
    topRelevance >= 0.58 ||
    strongMatches >= 3;

  return {
    context: `<graph-memory-context>\nRelevant memory nodes for this message:\n${lines.join("\n")}\n\nUse graph_memory(action="read_node", path="...") for full content.\n</graph-memory-context>`,
    shouldRequireLookup,
    suggestedPaths: scored.map((entry: any) => entry.path),
  };
}

function buildContextRefreshBlock(changedArtifacts: RefreshArtifact[], projectName?: string): string | null {
  if (changedArtifacts.length === 0) return null;

  const sections: string[] = [];
  if (changedArtifacts.includes("priors")) {
    const priors = readArtifactContent("priors");
    if (priors) sections.push(priors);
  }
  if (changedArtifacts.includes("soma")) {
    const soma = readArtifactContent("soma");
    if (soma) sections.push(soma);
  }
  if (changedArtifacts.includes("working")) {
    const working = readArtifactContent("working", projectName);
    if (working && !working.includes("No session handoff captured yet")) sections.push(working);
  }
  if (changedArtifacts.includes("map")) {
    sections.push("## MAP Refresh\n\nBackground memory consolidation updated the graph map. Use `graph_memory(action=\"search\")`, `recall`, or `read_node` for the newest graph state in this session.");
  }

  if (sections.length === 0) return null;
  return `<graph-memory-refresh>\nBackground memory updated since your last turn. Refresh your internal view with the sections below.\n\n${sections.join("\n\n---\n\n")}\n</graph-memory-refresh>`;
}

async function main() {
  if (process.env.GRAPH_MEMORY_PIPELINE_CHILD === "1" || process.env.GRAPH_MEMORY_WORKER === "1") return;
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

  // --- Ambient auto-recall ---
  // Output relevant memory context FIRST, before any pipeline dispatch actions.
  const sessionId = input.session_id || `session_${Date.now()}`;
  const recallResult = ambientRecall(input.prompt, project.name !== "global" ? project.name : undefined);
  if (recallResult.shouldRequireLookup) {
    writeMemoryGateState({
      sessionId,
      project: project.name,
      prompt: input.prompt,
      required: true,
      blockedCount: 0,
      requiredAt: new Date().toISOString(),
      suggestedPaths: recallResult.suggestedPaths,
    });
  } else {
    clearMemoryGateState(sessionId);
  }

  const additionalContextBlocks: string[] = [];
  if (recallResult.context) {
    additionalContextBlocks.push(recallResult.context);
  }

  // --- Mid-session reinjection when librarian-owned artifacts changed ---
  try {
    const changedArtifacts = diffSessionContextState(sessionId, project.name, ["priors", "soma", "map", "working"]);
    if (changedArtifacts.length > 0) {
      writeSessionContextState(sessionId, project.name);
      const refreshBlock = buildContextRefreshBlock(changedArtifacts, project.name);
      if (refreshBlock) {
        additionalContextBlocks.push(refreshBlock);
      }
    }
  } catch { /* non-critical */ }

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
    source: "user_submit",
  };
  if (project.name !== "global") {
    entry.project = project.name;
  }

  fs.appendFileSync(getConversationLogPath(sessionId), JSON.stringify(entry) + "\n");

  // Keep dirty state fresh
  markDirty(sessionId);

  if (additionalContextBlocks.length > 0) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: buildUserPromptAdditionalContext(additionalContextBlocks),
      },
    }));
  }

}

main().catch((err) => {
  console.error(`[graph-memory] on-user-message hook error: ${err.message}`);
  process.exit(0);
});
