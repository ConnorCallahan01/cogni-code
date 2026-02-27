import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { CONFIG } from "../config.js";
import { activityBus } from "../events.js";
import { extractJSON } from "./parse-utils.js";
import { runDecay } from "./decay.js";
import { safePath, walkNodes, extractFirstParagraph } from "../utils.js";

const LIBRARIAN_PROMPT = fs.readFileSync(
  path.join(CONFIG.paths.prompts, "librarian.md"),
  "utf-8"
);

interface LibrarianResult {
  nodes_to_create: Array<{
    path: string;
    title: string;
    gist: string;
    tags: string[];
    keywords: string[];
    confidence: number;
    edges: Array<{ target: string; type: string; weight: number }>;
    anti_edges: Array<{ target: string; reason: string }>;
    soma?: { valence: string; intensity: number; marker: string };
    content: string;
  }>;
  nodes_to_update: Array<{
    path: string;
    changes: {
      confidence?: number;
      new_edges?: Array<{ target: string; type: string; weight: number }>;
      new_anti_edges?: Array<{ target: string; reason: string }>;
      soma?: { valence: string; intensity: number; marker: string };
      append_content?: string;
    };
  }>;
  nodes_to_archive: Array<{ path: string; reason: string }>;
  new_priors: string[];
  decayed_priors: string[];
  map_entries: Array<{ path: string; gist: string; edges: string[] }>;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function loadSessionDeltas(sessionId: string): any | null {
  const deltaFile = path.join(CONFIG.paths.deltas, `${sessionId}.json`);
  if (!fs.existsSync(deltaFile)) return null;
  return JSON.parse(fs.readFileSync(deltaFile, "utf-8"));
}

export function buildLibrarianInput(sessionId: string): string | null {
  const deltas = loadSessionDeltas(sessionId);
  if (!deltas || deltas.scribes.length === 0) return null;

  let map = "_Empty graph._";
  if (fs.existsSync(CONFIG.paths.map)) {
    map = fs.readFileSync(CONFIG.paths.map, "utf-8");
  }

  let priors = "_No priors._";
  if (fs.existsSync(CONFIG.paths.priors)) {
    priors = fs.readFileSync(CONFIG.paths.priors, "utf-8");
  }

  const summaryChain = deltas.scribes.map((s: any) => s.summary).filter(Boolean);
  const allDeltas = deltas.scribes.flatMap((s: any) => s.deltas || []);

  // Load promoted dreams for librarian context
  let dreamsSection = "";
  const integratedDir = path.join(CONFIG.paths.dreams, "integrated");
  if (fs.existsSync(integratedDir)) {
    const dreamFiles = fs.readdirSync(integratedDir).filter(f => f.endsWith(".json"));
    if (dreamFiles.length > 0) {
      const dreams = dreamFiles.map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(integratedDir, f), "utf-8"));
        return `- [${f}] ${content.fragment} (confidence: ${content.confidence})`;
      });
      dreamsSection = `\n\n## Promoted Dreams (consider creating nodes)\n\n${dreams.join("\n")}`;
    }
  }

  return `## Current MAP\n\n${map}\n\n## Current PRIORS\n\n${priors}\n\n## Session Summary Chain\n\n${summaryChain.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n\n## Session Deltas (${allDeltas.length} total)\n\n${JSON.stringify(allDeltas, null, 2)}${dreamsSection}`;
}

export async function runLibrarian(sessionId: string): Promise<void> {
  activityBus.log("librarian:start", `Librarian starting for ${sessionId}`);
  const startTime = Date.now();

  const input = buildLibrarianInput(sessionId);
  if (!input) {
    activityBus.log("librarian:complete", "Librarian skipped — no deltas to process.");
    return;
  }

  try {
    const response = await getClient().messages.create({
      model: CONFIG.models.librarian,
      max_tokens: CONFIG.maxTokens.librarian,
      temperature: CONFIG.temperature.librarian,
      system: LIBRARIAN_PROMPT,
      messages: [
        { role: "user", content: input },
        { role: "assistant", content: "{" },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from librarian");
    }

    if (response.stop_reason === "max_tokens") {
      activityBus.log("librarian:error", `Librarian response truncated (hit max_tokens=${CONFIG.maxTokens.librarian}). Attempting JSON repair.`, {
        outputTokens: response.usage?.output_tokens,
      });
    }

    const result: LibrarianResult = extractJSON<LibrarianResult>("{" + textBlock.text);

    // Sanitize: ensure arrays exist even if truncation lost them
    result.nodes_to_create = result.nodes_to_create || [];
    result.nodes_to_update = result.nodes_to_update || [];
    result.nodes_to_archive = result.nodes_to_archive || [];
    result.new_priors = result.new_priors || [];
    result.decayed_priors = result.decayed_priors || [];
    result.map_entries = result.map_entries || [];
    const elapsed = Date.now() - startTime;

    await applyLibrarianResult(result);

    activityBus.log("librarian:complete", `Librarian complete in ${elapsed}ms — ${result.nodes_to_create.length} created, ${result.nodes_to_update.length} updated, ${result.nodes_to_archive.length} archived`, {
      elapsed,
      created: result.nodes_to_create.length,
      updated: result.nodes_to_update.length,
      archived: result.nodes_to_archive.length,
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    activityBus.log("librarian:error", `Librarian failed after ${elapsed}ms: ${err.message}`);

    // Retry once
    try {
      activityBus.log("librarian:start", "Librarian retrying...");
      await new Promise((r) => setTimeout(r, 2000));

      const response = await getClient().messages.create({
        model: CONFIG.models.librarian,
        max_tokens: CONFIG.maxTokens.librarian,
        temperature: CONFIG.temperature.librarian,
        system: LIBRARIAN_PROMPT,
        messages: [
          { role: "user", content: input },
          { role: "assistant", content: "{" },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text in retry");

      const result: LibrarianResult = extractJSON<LibrarianResult>("{" + textBlock.text);
      result.nodes_to_create = result.nodes_to_create || [];
      result.nodes_to_update = result.nodes_to_update || [];
      result.nodes_to_archive = result.nodes_to_archive || [];
      result.new_priors = result.new_priors || [];
      result.decayed_priors = result.decayed_priors || [];
      result.map_entries = result.map_entries || [];
      await applyLibrarianResult(result);

      activityBus.log("librarian:complete", `Librarian retry succeeded — ${result.nodes_to_create.length} created, ${result.nodes_to_update.length} updated`);
    } catch (retryErr: any) {
      activityBus.log("librarian:error", `Librarian retry failed: ${retryErr.message}. Deltas preserved for next session.`);
    }
  }
}

const VALID_EDGE_TYPES = new Set([
  // Core types
  "relates_to",
  "contradicts",
  "supports",
  "derives_from",
  "pattern_transfer",
  // Semantic types the LLM commonly generates
  "evidenced_by",
  "instantiates",
  "supersedes",
  "depends_on",
  "extends",
  "refines",
  "implements",
  "influences",
  "precedes",
  "follows",
  "part_of",
  "contains",
  "inspired_by",
  "analogous_to",
  "contrasts_with",
  "enables",
  "blocks",
]);

function validateEdgeType(type: string): string {
  // Normalize: lowercase, underscores
  const normalized = type.toLowerCase().replace(/[\s-]+/g, "_");
  if (VALID_EDGE_TYPES.has(normalized)) return normalized;
  // Accept any snake_case type the LLM generates (don't restrict creativity)
  if (/^[a-z][a-z0-9_]*$/.test(normalized)) {
    activityBus.log("system:info", `New edge type "${normalized}" from LLM — accepting.`);
    return normalized;
  }
  activityBus.log("system:info", `Malformed edge type "${type}" — defaulting to relates_to`);
  return "relates_to";
}

async function applyLibrarianResult(result: LibrarianResult) {
  // 0. Run decay pass first
  try {
    const reinforcedPaths = new Set<string>();
    for (const u of result.nodes_to_update) reinforcedPaths.add(u.path);
    runDecay(reinforcedPaths);
  } catch (err: any) {
    activityBus.log("system:error", `Failed during decay pass: ${err.message}`);
  }

  // 1. Create new nodes (or merge into existing)
  try {
    for (const node of result.nodes_to_create) {
      const filePath = safePath(CONFIG.paths.nodes, node.path, ".md");
      if (!filePath) {
        activityBus.log("system:error", `Invalid node path from LLM: ${node.path}`);
        continue;
      }

      // If node already exists, merge instead of overwrite
      if (fs.existsSync(filePath)) {
        activityBus.log("system:info", `Node already exists: ${node.path} — merging.`);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const parsed = matter(raw);

          // Boost confidence (take the max)
          if (node.confidence > (parsed.data.confidence || 0)) {
            parsed.data.confidence = node.confidence;
          }

          // Merge edges (dedupe by target)
          const existingEdges = parsed.data.edges || [];
          const existingTargets = new Set(existingEdges.map((e: any) => e.target));
          for (const edge of node.edges || []) {
            if (!existingTargets.has(edge.target)) {
              existingEdges.push({ ...edge, type: validateEdgeType(edge.type) });
            }
          }
          parsed.data.edges = existingEdges;

          // Merge tags and keywords (dedupe)
          parsed.data.tags = [...new Set([...(parsed.data.tags || []), ...(node.tags || [])])];
          parsed.data.keywords = [...new Set([...(parsed.data.keywords || []), ...(node.keywords || [])])];

          // Append new content if substantially different
          if (node.content && !parsed.content.includes(node.content.slice(0, 100))) {
            parsed.content = parsed.content.trimEnd() + `\n\n---\n\n${node.content}`;
          }

          parsed.data.updated = new Date().toISOString().slice(0, 10);
          fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data));

          activityBus.log("graph:node_merged", `Merged into existing node: ${node.path}`, {
            path: node.path,
            confidence: parsed.data.confidence,
          });
        } catch (mergeErr: any) {
          activityBus.log("system:error", `Failed to merge node ${node.path}: ${mergeErr.message}`);
        }
        continue;
      }

      const nodeDir = path.dirname(filePath);
      if (!fs.existsSync(nodeDir)) fs.mkdirSync(nodeDir, { recursive: true });

      const now = new Date().toISOString().slice(0, 10);
      const frontmatterData: Record<string, any> = {
        id: node.path,
        title: node.title,
        gist: node.gist,
        confidence: node.confidence,
        created: now,
        updated: now,
        decay_rate: 0.05,
        tags: node.tags,
        keywords: node.keywords,
      };

      if (node.edges && node.edges.length > 0) {
        frontmatterData.edges = node.edges.map(e => ({
          ...e,
          type: validateEdgeType(e.type),
        }));
      }
      if (node.anti_edges && node.anti_edges.length > 0) {
        frontmatterData.anti_edges = node.anti_edges;
      }
      if (node.soma) {
        frontmatterData.soma = node.soma;
      }

      const body = `# ${node.title}\n\n${node.content}`;
      const fullContent = matter.stringify(body, frontmatterData);
      fs.writeFileSync(filePath, fullContent);

      activityBus.log("graph:node_created", `Created node: ${node.path}`, {
        path: node.path,
        confidence: node.confidence,
      });
    }
  } catch (err: any) {
    activityBus.log("system:error", `Failed during node creation: ${err.message}`);
  }

  // 2. Update existing nodes
  try {
    for (const update of result.nodes_to_update) {
      const filePath = safePath(CONFIG.paths.nodes, update.path, ".md");
      if (!filePath) {
        activityBus.log("system:error", `Invalid update path from LLM: ${update.path}`);
        continue;
      }
      if (!fs.existsSync(filePath)) {
        activityBus.log("system:error", `Cannot update non-existent node: ${update.path}`);
        continue;
      }

      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);

      if (update.changes.confidence !== undefined) {
        parsed.data.confidence = update.changes.confidence;
      }

      if (update.changes.new_edges && update.changes.new_edges.length > 0) {
        const existing = parsed.data.edges || [];
        const existingTargets = new Set(existing.map((e: any) => e.target));
        for (const edge of update.changes.new_edges) {
          if (!existingTargets.has(edge.target)) {
            existing.push({ ...edge, type: validateEdgeType(edge.type) });
          }
        }
        parsed.data.edges = existing;
      }

      if (update.changes.new_anti_edges && update.changes.new_anti_edges.length > 0) {
        const existing = parsed.data.anti_edges || [];
        const existingTargets = new Set(existing.map((e: any) => e.target));
        for (const ae of update.changes.new_anti_edges) {
          if (!existingTargets.has(ae.target)) {
            existing.push(ae);
          }
        }
        parsed.data.anti_edges = existing;
      }

      if (update.changes.soma) {
        parsed.data.soma = update.changes.soma;
      }

      parsed.data.updated = new Date().toISOString().slice(0, 10);

      let body = parsed.content;
      if (update.changes.append_content) {
        body += `\n\n${update.changes.append_content}`;
      }

      fs.writeFileSync(filePath, matter.stringify(body, parsed.data));

      activityBus.log("graph:node_updated", `Updated node: ${update.path}`, {
        path: update.path,
        changes: Object.keys(update.changes),
      });
    }
  } catch (err: any) {
    activityBus.log("system:error", `Failed during node updates: ${err.message}`);
  }

  // 3. Archive nodes
  try {
    for (const archive of result.nodes_to_archive) {
      const srcPath = safePath(CONFIG.paths.nodes, archive.path, ".md");
      const destPath = safePath(CONFIG.paths.archive, archive.path, ".md");
      if (!srcPath || !destPath) continue;
      if (!fs.existsSync(srcPath)) continue;

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(srcPath, destPath);

      activityBus.log("graph:node_archived", `Archived node: ${archive.path} — ${archive.reason}`, {
        path: archive.path,
        reason: archive.reason,
      });
    }
  } catch (err: any) {
    activityBus.log("system:error", `Failed during node archival: ${err.message}`);
  }

  // 4. Update PRIORS
  try {
    if (result.new_priors.length > 0 || result.decayed_priors.length > 0) {
      updatePriors(result.new_priors, result.decayed_priors);
    }
  } catch (err: any) {
    activityBus.log("system:error", `Failed during priors update: ${err.message}`);
  }

  // 5. Full MAP rebuild
  try {
    fullRegenerateMAP();
  } catch (err: any) {
    activityBus.log("system:error", `Failed during MAP rebuild: ${err.message}`);
  }

  // 6. Rebuild index
  try {
    rebuildIndex();
  } catch (err: any) {
    activityBus.log("system:error", `Failed during index rebuild: ${err.message}`);
  }
}

function updatePriors(newPriors: string[], decayedPriors: string[]) {
  if (!fs.existsSync(CONFIG.paths.priors)) {
    fs.writeFileSync(
      CONFIG.paths.priors,
      `# PRIORS — Behavioral Guidelines\n\n> Derived from cross-session patterns.\n\n`
    );
  }

  let content = fs.readFileSync(CONFIG.paths.priors, "utf-8");
  const lines = content.split("\n");

  // Separate header lines from numbered prior lines
  const headerLines: string[] = [];
  const priorLines: string[] = [];
  for (const line of lines) {
    if (/^\d+\./.test(line)) {
      priorLines.push(line.replace(/^\d+\.\s*/, "")); // strip number prefix
    } else {
      headerLines.push(line);
    }
  }

  // Remove decayed priors (fuzzy match — normalize and check substring)
  for (const decayed of decayedPriors) {
    const normalized = decayed.toLowerCase().replace(/\*\*/g, "").trim();
    const idx = priorLines.findIndex(p => p.toLowerCase().replace(/\*\*/g, "").includes(normalized));
    if (idx !== -1) {
      priorLines.splice(idx, 1);
    }
  }

  // Check for near-duplicates before adding new priors
  for (const prior of newPriors) {
    const normalizedNew = prior.toLowerCase().replace(/\*\*/g, "").trim();
    const isDuplicate = priorLines.some(existing => {
      const normalizedExisting = existing.toLowerCase().replace(/\*\*/g, "").trim();
      // Simple overlap check: if >60% of words overlap, consider duplicate
      const newWords = new Set(normalizedNew.split(/\s+/));
      const existingWords = normalizedExisting.split(/\s+/);
      const overlap = existingWords.filter(w => newWords.has(w)).length;
      return overlap / Math.max(newWords.size, existingWords.length) > 0.6;
    });

    if (!isDuplicate) {
      const parts = prior.split(" — ");
      if (parts.length > 1) {
        priorLines.push(`**${parts[0]}** — ${parts.slice(1).join(" — ")}`);
      } else {
        priorLines.push(prior);
      }
    }
  }

  // Enforce maxPriors cap (remove oldest — first in list)
  while (priorLines.length > CONFIG.graph.maxPriors) {
    priorLines.shift();
  }

  // Rebuild with clean sequential numbering
  const rebuiltLines = [...headerLines];
  for (let i = 0; i < priorLines.length; i++) {
    rebuiltLines.push(`${i + 1}. ${priorLines[i]}`);
  }

  fs.writeFileSync(CONFIG.paths.priors, rebuiltLines.join("\n"));

  activityBus.log("graph:priors_updated", `Priors updated: +${newPriors.length}, -${decayedPriors.length}, total: ${priorLines.length}/${CONFIG.graph.maxPriors}`);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface MapEntry {
  nodePath: string;
  line: string;
  confidence: number;
  somaMarker?: string;
}

function fullRegenerateMAP() {
  const nodesDir = CONFIG.paths.nodes;
  if (!fs.existsSync(nodesDir)) return;

  const allEntries: MapEntry[] = [];

  for (const { nodePath, filePath } of walkNodes(nodesDir)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      const gist = parsed.data.gist || extractFirstParagraph(parsed.content);
      const edges: string[] = (parsed.data.edges || []).map((e: any) => e.target).filter(Boolean);
      const edgeStr = edges.length > 0 ? ` → [${edges.join(", ")}]` : "";
      const confidence = typeof parsed.data.confidence === "number" ? parsed.data.confidence : 0.5;
      const somaMarker = parsed.data.soma?.marker;
      const somaStr = somaMarker ? ` ⚡${somaMarker}` : "";

      allEntries.push({
        nodePath,
        line: `- **${nodePath}** — ${gist}${edgeStr}${somaStr}`,
        confidence,
        somaMarker,
      });
    } catch {
      // Skip
    }
  }

  // Enforce maxNodesBeforePrune
  if (allEntries.length > CONFIG.graph.maxNodesBeforePrune) {
    const sorted = [...allEntries].sort((a, b) => a.confidence - b.confidence);
    const toArchive = sorted.slice(0, allEntries.length - CONFIG.graph.maxNodesBeforePrune);

    for (const entry of toArchive) {
      try {
        const srcPath = path.join(CONFIG.paths.nodes, `${entry.nodePath}.md`);
        const destPath = path.join(CONFIG.paths.archive, `${entry.nodePath}.md`);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(srcPath, destPath);
      } catch { /* skip */ }
    }

    const prunedPaths = new Set(toArchive.map(e => e.nodePath));
    const remaining = allEntries.filter(e => !prunedPaths.has(e.nodePath));
    allEntries.length = 0;
    allEntries.push(...remaining);
  }

  const header = `# MAP — Knowledge Graph Index\n\n> Auto-generated. Each entry: path | gist | edges\n> ~50-80 tokens per entry. This is the agent's "hippocampus."\n`;
  const headerTokens = estimateTokens(header);

  allEntries.sort((a, b) => b.confidence - a.confidence);

  let tokenBudget = CONFIG.graph.maxMapTokens - headerTokens;
  const includedEntries: MapEntry[] = [];

  for (const entry of allEntries) {
    const entryTokens = estimateTokens(entry.line + "\n");
    if (tokenBudget - entryTokens < 200 && includedEntries.length > 0) continue;
    tokenBudget -= entryTokens;
    includedEntries.push(entry);
  }

  const categories = new Map<string, string[]>();
  for (const entry of includedEntries) {
    const cat = entry.nodePath.split("/")[0];
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(entry.line);
  }

  let newMAP = header;

  for (const [cat, entryLines] of categories) {
    newMAP += `\n## ${cat}\n\n`;
    newMAP += entryLines.join("\n") + "\n";
  }

  // Add dream hints
  const pendingDir = path.join(CONFIG.paths.dreams, "pending");
  if (fs.existsSync(pendingDir)) {
    const dreamFiles = fs.readdirSync(pendingDir).filter(f => f.endsWith(".json"));
    const dreamHints: string[] = [];
    for (const f of dreamFiles) {
      try {
        const dream = JSON.parse(fs.readFileSync(path.join(pendingDir, f), "utf-8"));
        if (dream.confidence >= 0.3) {
          dreamHints.push(`- ${dream.fragment.slice(0, 100)} (${dream.type}, confidence: ${dream.confidence})`);
        }
      } catch { /* skip */ }
    }
    if (dreamHints.length > 0) {
      newMAP += `\n## Dreams\n\n`;
      newMAP += dreamHints.join("\n") + "\n";
    }
  }

  if (categories.size === 0) {
    newMAP += `\n_No nodes yet. The graph will grow as conversations happen._\n`;
  }

  fs.writeFileSync(CONFIG.paths.map, newMAP);

  activityBus.log("graph:map_regenerated", `MAP rebuilt: ${includedEntries.length} entries, ~${estimateTokens(newMAP)} tokens`);
}

function rebuildIndex() {
  const nodesDir = CONFIG.paths.nodes;
  if (!fs.existsSync(nodesDir)) return;

  const index: any[] = [];

  for (const { nodePath, filePath } of walkNodes(nodesDir)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      const fm = parsed.data;

      index.push({
        path: nodePath,
        gist: ((fm.gist || extractFirstParagraph(parsed.content)) as string).slice(0, 200),
        tags: fm.tags || [],
        keywords: fm.keywords || [],
        edges: (fm.edges || []).map((e: any) => e.target).filter(Boolean),
        anti_edges: (fm.anti_edges || []).map((e: any) => e.target).filter(Boolean),
        confidence: typeof fm.confidence === "number" ? fm.confidence : 0.5,
        soma_intensity: fm.soma?.intensity || 0,
        updated: fm.updated || fm.created || null,
        last_accessed: fm.last_accessed || new Date().toISOString(),
        access_count: fm.access_count || 0,
      });
    } catch {
      // Skip
    }
  }

  fs.writeFileSync(CONFIG.paths.index, JSON.stringify(index, null, 2));
}
