import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { z } from "zod";
import { CONFIG, isGraphInitialized, saveGlobalConfig, reloadConfig } from "./config.js";
import { initializeGraph } from "./index.js";
import { activityBus } from "./events.js";
import { safePath, countFiles as countFilesUtil } from "./utils.js";
import { listCommits, revertTo, autoCommit } from "./git.js";
import { somaBoost } from "./soma.js";
import { BufferWatcher } from "./buffer-watcher.js";
import { runLibrarian, buildLibrarianInput } from "./pipeline/librarian.js";
import { runDreamer, buildDreamerInput } from "./pipeline/dreamer.js";
import { updateManifest } from "./manifest.js";

// --- Index cache ---
let indexCache: { data: any[]; mtime: number } | null = null;

function loadIndex(): any[] {
  const indexPath = CONFIG.paths.index;
  if (!fs.existsSync(indexPath)) return [];

  const stat = fs.statSync(indexPath);
  const mtime = stat.mtimeMs;

  if (indexCache && indexCache.mtime === mtime) {
    return indexCache.data;
  }

  const data = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  indexCache = { data, mtime };
  return data;
}

// Singleton buffer watcher for log_exchange
let bufferWatcher: BufferWatcher | null = null;

function getBufferWatcher(): BufferWatcher {
  if (!bufferWatcher) {
    bufferWatcher = new BufferWatcher();
  }
  return bufferWatcher;
}

// Tool handler for graph_memory
export async function handleGraphMemory(args: {
  action: string;
  path?: string;
  query?: string;
  note?: string;
  graphRoot?: string;
  messages?: Array<{ role: string; content: string }>;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { action } = args;

  switch (action) {
    case "read_node":
      return readNode(args.path);
    case "search":
      return searchGraph(args.query);
    case "list_edges":
      return listEdges(args.path);
    case "read_dream":
      return readDream(args.path);
    case "write_note":
      return writeNote(args.note);
    case "status":
      return getStatus();
    case "history":
      return getHistory();
    case "revert":
      return revertGraph(args.path);
    case "consolidate":
      return runConsolidation();
    case "log_exchange":
      return logExchange(args.messages);
    case "initialize":
      return initializeGraphAction(args.graphRoot);
    default:
      return {
        content: [{ type: "text", text: `Unknown action: ${action}. Available: read_node, search, list_edges, read_dream, write_note, status, history, revert, consolidate, log_exchange, initialize` }],
        isError: true,
      };
  }
}

// --- consolidate action ---

async function runConsolidation(): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!CONFIG.pipeline.dedicatedMode) {
    // Piggyback mode: return structured instructions for the host agent
    return buildPiggybackInstructions();
  }

  // Dedicated mode: run the full pipeline directly
  const watcher = getBufferWatcher();
  const sessionId = watcher.getSessionId() || `session_${Date.now()}`;

  activityBus.log("session:end", `Consolidation triggered (dedicated mode) for ${sessionId}`);

  try {
    // 1. Flush any buffered messages through scribe
    await watcher.flush();

    // 2. Run librarian
    await runLibrarian(sessionId);

    // 3. Run dreamer
    await runDreamer(sessionId);

    // 4. Update manifest
    updateManifest();

    // 5. Git auto-commit
    await autoCommit("consolidation (plugin)");

    // 6. Reset watcher for next session
    watcher.startSession();

    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true,
        sessionId,
        message: "Consolidation complete. Graph updated, MAP regenerated, dreams processed.",
      }, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: false,
        error: err.message,
        message: "Consolidation failed. Deltas preserved for next attempt.",
      }, null, 2) }],
    };
  }
}

/**
 * Piggyback mode: instead of making direct API calls, return structured prompts
 * that the host agent can execute using its own credentials.
 */
function buildPiggybackInstructions(): { content: Array<{ type: "text"; text: string }> } {
  const watcher = getBufferWatcher();
  const sessionId = watcher.getSessionId() || `session_${Date.now()}`;

  // Check if there are deltas to process
  const deltaFile = path.join(CONFIG.paths.deltas, `${sessionId}.json`);
  if (!fs.existsSync(deltaFile)) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        mode: "piggyback",
        status: "no_deltas",
        message: "No conversation data buffered for this session. Nothing to consolidate.",
      }, null, 2) }],
    };
  }

  const librarianInput = buildLibrarianInput(sessionId);
  const dreamerInput = buildDreamerInput(sessionId);

  // Load prompt files
  const librarianPrompt = fs.readFileSync(path.join(CONFIG.paths.prompts, "librarian.md"), "utf-8");
  const dreamerPrompt = fs.readFileSync(path.join(CONFIG.paths.prompts, "dreamer.md"), "utf-8");

  return {
    content: [{ type: "text", text: JSON.stringify({
      mode: "piggyback",
      status: "ready",
      message: "Consolidation requires processing. Follow the steps below using your own capabilities.",
      sessionId,
      steps: [
        {
          step: 1,
          name: "librarian",
          description: "Reconcile session deltas into graph updates",
          systemPrompt: librarianPrompt,
          userInput: librarianInput,
          instructions: "Process this with the librarian system prompt. The output is JSON. Then call graph_memory(action='apply_consolidation', path='librarian', note=<JSON output>).",
        },
        ...(dreamerInput ? [{
          step: 2,
          name: "dreamer",
          description: "Creative recombination — find surprising connections",
          systemPrompt: dreamerPrompt,
          userInput: dreamerInput,
          instructions: "Process this with the dreamer system prompt at high temperature. The output is JSON. Then call graph_memory(action='apply_consolidation', path='dreamer', note=<JSON output>).",
        }] : []),
      ],
    }, null, 2) }],
  };
}

// --- log_exchange action ---

function logExchange(
  messages?: Array<{ role: string; content: string }>
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  if (!messages || messages.length === 0) {
    return {
      content: [{ type: "text", text: "Error: messages array required for log_exchange" }],
      isError: true,
    };
  }

  const watcher = getBufferWatcher();

  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    watcher.appendMessage({
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    content: [{ type: "text", text: `Logged ${messages.length} messages. Buffer: ${watcher.getStatus().bufferCount}/${CONFIG.session.scribeInterval}` }],
  };
}

// --- Existing actions (unchanged logic) ---

function readNode(nodePath?: string) {
  if (!nodePath) {
    return { content: [{ type: "text" as const, text: "Error: path required for read_node" }], isError: true };
  }

  const fullPath = safePath(CONFIG.paths.nodes, nodePath, ".md");
  if (!fullPath) {
    return { content: [{ type: "text" as const, text: `Invalid path: ${nodePath}` }], isError: true };
  }

  if (!fs.existsSync(fullPath)) {
    const archivePath = safePath(CONFIG.paths.archive, nodePath, ".md");
    if (archivePath && fs.existsSync(archivePath)) {
      const content = fs.readFileSync(archivePath, "utf-8");
      return { content: [{ type: "text" as const, text: `[ARCHIVED]\n\n${content}` }] };
    }
    return { content: [{ type: "text" as const, text: `Node not found: ${nodePath}` }], isError: true };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  updateLastAccessed(nodePath);
  return { content: [{ type: "text" as const, text: content }] };
}

function updateLastAccessed(nodePath: string) {
  const now = new Date().toISOString();

  const fullPath = safePath(CONFIG.paths.nodes, nodePath, ".md");
  if (fullPath && fs.existsSync(fullPath)) {
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const parsed = matter(raw);
      parsed.data.last_accessed = now;
      parsed.data.access_count = (parsed.data.access_count || 0) + 1;
      fs.writeFileSync(fullPath, matter.stringify(parsed.content, parsed.data));
    } catch { /* Non-critical */ }
  }

  try {
    const index = loadIndex();
    const entry = index.find((e: any) => e.path === nodePath);
    if (entry) {
      entry.last_accessed = now;
      entry.access_count = (entry.access_count || 0) + 1;
      fs.writeFileSync(CONFIG.paths.index, JSON.stringify(index, null, 2));
      indexCache = null;
    }
  } catch { /* Non-critical */ }
}

function searchGraph(query?: string) {
  if (!query) {
    return { content: [{ type: "text" as const, text: "Error: query required for search" }], isError: true };
  }

  const index = loadIndex();
  if (index.length === 0) {
    return { content: [{ type: "text" as const, text: "Graph index not yet built. No nodes to search." }] };
  }

  try {
    const queryTokens = query.toLowerCase().split(/\s+/);

    const results = index
      .map((entry: any) => {
        const gistTokens = (entry.gist || "").toLowerCase().split(/\s+/);
        const tagTokens = (entry.tags || []).map((t: string) => t.toLowerCase());
        const keywordTokens = (entry.keywords || []).map((k: string) => k.toLowerCase());

        const gistScore = overlap(queryTokens, gistTokens) * 3;
        const tagScore = overlap(queryTokens, tagTokens) * 2;
        const keywordScore = overlap(queryTokens, keywordTokens) * 1;

        const baseRelevance = (gistScore + tagScore + keywordScore) * (entry.confidence || 0.5);
        const recency = recencyBoost(entry.last_accessed);
        const soma = somaBoost(entry.soma_intensity || 0);
        const relevance = baseRelevance * recency * soma;

        const reasons: string[] = [];
        if (gistScore > 0) reasons.push(`gist match (${Math.round(gistScore / 3 * 100)}%)`);
        const matchedTags = (entry.tags || []).filter((t: string) => queryTokens.includes(t.toLowerCase()));
        if (matchedTags.length > 0) reasons.push(`tag: ${matchedTags.join(", ")}`);
        if (soma > 1.0) reasons.push(`soma ${soma.toFixed(1)}x`);
        if (recency !== 1.0) reasons.push(`recency ${recency.toFixed(1)}x`);

        return { ...entry, relevance, match_reason: reasons.join("; ") };
      })
      .filter((e: any) => e.relevance > 0.1)
      .sort((a: any, b: any) => b.relevance - a.relevance)
      .slice(0, 5);

    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: `No results for: "${query}"` }] };
    }

    const formatted = results
      .map((r: any) => `- ${r.path} (relevance: ${r.relevance.toFixed(2)})\n  ${r.gist}\n  [${r.match_reason}]`)
      .join("\n\n");

    return { content: [{ type: "text" as const, text: formatted }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Search error: ${err}` }], isError: true };
  }
}

function recencyBoost(lastAccessed?: string): number {
  if (!lastAccessed) return 0.8;
  const daysSince = (Date.now() - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1.2;
  if (daysSince <= 30) return 1.0;
  return 0.8;
}

function listEdges(nodePath?: string) {
  if (!nodePath) {
    return { content: [{ type: "text" as const, text: "Error: path required for list_edges" }], isError: true };
  }

  const fullPath = safePath(CONFIG.paths.nodes, nodePath, ".md");
  if (!fullPath) {
    return { content: [{ type: "text" as const, text: `Invalid path: ${nodePath}` }], isError: true };
  }
  if (!fs.existsSync(fullPath)) {
    return { content: [{ type: "text" as const, text: `Node not found: ${nodePath}` }], isError: true };
  }

  const raw = fs.readFileSync(fullPath, "utf-8");

  try {
    const parsed = matter(raw);
    const edges = parsed.data.edges || [];
    const antiEdges = parsed.data.anti_edges || [];

    const result = {
      path: nodePath,
      title: parsed.data.title || nodePath,
      confidence: parsed.data.confidence,
      edges: edges.map((e: any) => ({
        target: e.target,
        type: e.type || "relates_to",
        weight: e.weight || 0.5,
      })),
      anti_edges: antiEdges.map((ae: any) => ({
        target: ae.target,
        reason: ae.reason || "",
      })),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch {
    return { content: [{ type: "text" as const, text: `Failed to parse frontmatter for: ${nodePath}` }], isError: true };
  }
}

function readDream(dreamPath?: string) {
  if (!dreamPath) {
    const pendingDir = path.join(CONFIG.paths.dreams, "pending");
    if (!fs.existsSync(pendingDir)) {
      return { content: [{ type: "text" as const, text: "No pending dreams." }] };
    }
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith(".json"));
    if (files.length === 0) {
      return { content: [{ type: "text" as const, text: "No pending dreams." }] };
    }
    return { content: [{ type: "text" as const, text: `Pending dreams:\n${files.map(f => `- ${f}`).join("\n")}` }] };
  }

  const fullPath = safePath(CONFIG.paths.dreams, dreamPath, ".json");
  if (!fullPath || !fs.existsSync(fullPath)) {
    return { content: [{ type: "text" as const, text: `Dream not found: ${dreamPath}` }], isError: true };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  return { content: [{ type: "text" as const, text: content }] };
}

function writeNote(note?: string) {
  if (!note) {
    return { content: [{ type: "text" as const, text: "Error: note required for write_note" }], isError: true };
  }

  const notesDir = path.join(CONFIG.paths.buffer, "notes");
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }

  const noteFile = path.join(notesDir, `note_${Date.now()}.md`);
  fs.writeFileSync(noteFile, note);

  return { content: [{ type: "text" as const, text: "Note saved." }] };
}

async function getHistory() {
  const commits = await listCommits(10);
  if (commits.length === 0) {
    return { content: [{ type: "text" as const, text: "No memory commits found." }] };
  }

  const formatted = commits.map(c => {
    const shortHash = c.hash.slice(0, 7);
    return `${shortHash}  ${c.date}  ${c.message}`;
  }).join("\n");

  return { content: [{ type: "text" as const, text: `Recent memory commits:\n\n${formatted}\n\nUse action="revert" path="<hash>" to roll back.` }] };
}

async function revertGraph(commitHash?: string) {
  if (!commitHash) {
    return { content: [{ type: "text" as const, text: "Error: path (commit hash) required for revert" }], isError: true };
  }

  const result = await revertTo(commitHash);
  if (result.success) {
    return { content: [{ type: "text" as const, text: result.message }] };
  }
  return { content: [{ type: "text" as const, text: result.message }], isError: true };
}

function initializeGraphAction(graphRoot?: string) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    return { content: [{ type: "text" as const, text: "Error: cannot determine home directory" }], isError: true };
  }

  const resolvedRoot = graphRoot
    ? path.resolve(graphRoot.replace(/^~/, home))
    : path.join(home, ".graph-memory");

  // Reject dangerous paths
  const dangerous = ["/", "/etc", "/usr", "/var", "/bin", "/sbin", "/lib", "/sys", "/proc"];
  if (dangerous.includes(resolvedRoot)) {
    return { content: [{ type: "text" as const, text: `Error: refusing to initialize graph at system path: ${resolvedRoot}` }], isError: true };
  }

  saveGlobalConfig(resolvedRoot);
  reloadConfig();
  initializeGraph();

  return getStatus();
}

function getStatus() {
  const initialized = isGraphInitialized();
  const mapExists = fs.existsSync(CONFIG.paths.map);
  const priorsExists = fs.existsSync(CONFIG.paths.priors);
  const indexExists = fs.existsSync(CONFIG.paths.index);

  let nodeCount = 0;
  if (fs.existsSync(CONFIG.paths.nodes)) {
    nodeCount = countFilesUtil(CONFIG.paths.nodes, ".md");
  }

  let dreamCount = 0;
  const pendingDir = path.join(CONFIG.paths.dreams, "pending");
  if (fs.existsSync(pendingDir)) {
    dreamCount = fs.readdirSync(pendingDir).filter(f => f.endsWith(".json")).length;
  }

  const warnings: string[] = [];

  if (mapExists) {
    const mapContent = fs.readFileSync(CONFIG.paths.map, "utf-8");
    const mapTokens = Math.ceil(mapContent.length / 4);
    const mapUsage = mapTokens / CONFIG.graph.maxMapTokens;
    if (mapUsage > 0.9) {
      warnings.push(`MAP at ${Math.round(mapUsage * 100)}% of token budget`);
    }
  }

  const nodeUsage = nodeCount / CONFIG.graph.maxNodesBeforePrune;
  if (nodeUsage > 0.8) {
    warnings.push(`Node count at ${Math.round(nodeUsage * 100)}% of limit (${nodeCount}/${CONFIG.graph.maxNodesBeforePrune})`);
  }

  const index = loadIndex();
  const lowConfNodes = index.filter((e: any) => (e.confidence || 0.5) < 0.3);
  if (lowConfNodes.length > 0) {
    warnings.push(`${lowConfNodes.length} node(s) below 0.3 confidence`);
  }

  const watcher = bufferWatcher?.getStatus();

  const status = {
    initialized,
    firstRun: !initialized,
    graphRoot: CONFIG.paths.graphRoot,
    pipelineMode: CONFIG.pipeline.dedicatedMode ? "dedicated" : "piggyback",
    mapLoaded: mapExists,
    priorsLoaded: priorsExists,
    indexBuilt: indexExists,
    nodeCount,
    pendingDreams: dreamCount,
    warnings,
    ...(watcher ? { session: watcher } : {}),
  };

  return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
}

// Helpers
function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const token of a) {
    if (setB.has(token)) count++;
  }
  return a.length > 0 ? count / a.length : 0;
}

// Zod schema for the tool (exported for MCP server registration)
export const graphMemorySchema = {
  action: z.enum([
    "read_node", "search", "list_edges", "read_dream", "write_note",
    "status", "history", "revert", "consolidate", "log_exchange", "initialize"
  ]).describe("The action to perform on the knowledge graph"),
  path: z.string().optional()
    .describe("Node path for read_node/list_edges, dream path for read_dream, commit hash for revert"),
  query: z.string().optional()
    .describe("Search query for the search action"),
  note: z.string().optional()
    .describe("Note content for write_note action"),
  graphRoot: z.string().optional()
    .describe("Storage path for initialize action (defaults to ~/.graph-memory/)"),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional()
    .describe("Message array for log_exchange action: [{role, content}, ...]"),
};
