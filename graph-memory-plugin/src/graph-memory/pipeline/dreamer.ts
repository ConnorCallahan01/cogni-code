/**
 * Phase 3: Dreamer — creative recombination with rate limiting and graph connectivity.
 *
 * Changes from original:
 * - Rate limits output to maxDreamsPerSession
 * - Hard cap on pending dreams (maxPendingDreams)
 * - Dream-to-node graph connectivity via dream_refs
 * - Dream promotion creates child nodes
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { CONFIG } from "../config.js";
import { activityBus } from "../events.js";
import { safePath } from "../utils.js";
import { regenerateDreamContext } from "./graph-ops.js";

export interface DreamFragment {
  fragment: string;
  confidence: number;
  nodes_referenced: string[];
  type: "connection" | "inversion" | "analogy" | "emergence" | "integration";
}

export interface DreamerResult {
  dreams: DreamFragment[];
  promotions: Array<{
    dream_file: string;
    reason: string;
    new_confidence: number;
  }>;
}

function loadPendingDreams(): Array<{ file: string; content: any }> {
  const pendingDir = path.join(CONFIG.paths.dreams, "pending");
  if (!fs.existsSync(pendingDir)) return [];

  const results: Array<{ file: string; content: any }> = [];
  for (const f of fs.readdirSync(pendingDir).filter((f) => f.endsWith(".json"))) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(pendingDir, f), "utf-8"));
      results.push({ file: f, content });
    } catch {
      // Skip malformed dream files
    }
  }
  return results;
}

export function buildDreamerInput(sessionId: string): string | null {
  let map = "_Empty graph._";
  if (fs.existsSync(CONFIG.paths.map)) {
    map = fs.readFileSync(CONFIG.paths.map, "utf-8");
  }

  const deltaFile = path.join(CONFIG.paths.deltas, `${sessionId}.json`);
  let deltas = "No deltas.";
  if (fs.existsSync(deltaFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deltaFile, "utf-8"));
      const allDeltas = (data.scribes || []).flatMap((s: any) => s.deltas || []);
      if (allDeltas.length === 0) return null;
      deltas = JSON.stringify(allDeltas, null, 2);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const pending = loadPendingDreams();
  const pendingStr = pending.length > 0
    ? pending.map((p) => `### ${p.file}\n${JSON.stringify(p.content, null, 2)}`).join("\n\n")
    : "No pending dreams.";

  return `## Current MAP\n\n${map}\n\n## Recent Session Deltas\n\n${deltas}\n\n## Pending Dreams (${pending.length})\n\n${pendingStr}`;
}

/**
 * Apply dreamer results to the graph.
 * Called by the consolidate action or directly by the dreamer subagent.
 */
export function applyDreamerResult(result: DreamerResult, sessionId: string) {
  const pendingDir = path.join(CONFIG.paths.dreams, "pending");
  if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });

  // Hard cap: enforce maxPendingDreams before writing new dreams
  const existingPending = loadPendingDreams();
  const newDreams = result.dreams || [];
  const maxPending = CONFIG.graph.maxPendingDreams;

  if (existingPending.length + newDreams.length > maxPending) {
    // Archive lowest-confidence pending dreams to make room
    const sorted = [...existingPending].sort(
      (a, b) => (a.content.confidence || 0) - (b.content.confidence || 0)
    );
    const toArchive = sorted.slice(0, existingPending.length + newDreams.length - maxPending);

    const archivedDir = path.join(CONFIG.paths.dreams, "archived");
    if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });

    for (const dream of toArchive) {
      try {
        const srcPath = path.join(pendingDir, dream.file);
        dream.content.archived_reason = "cap_exceeded";
        dream.content.archived_date = new Date().toISOString();
        fs.writeFileSync(path.join(archivedDir, dream.file), JSON.stringify(dream.content, null, 2));
        // Remove dream_refs from referenced nodes
        removeDreamRefs(dream.file, dream.content.nodes_referenced || []);
        fs.unlinkSync(srcPath);
      } catch { /* skip */ }
    }

    activityBus.log("graph:dream_capped", `Archived ${toArchive.length} dreams to enforce cap of ${maxPending}`);
  }

  // Write new dreams + add dream_refs to referenced nodes
  for (const dream of newDreams) {
    const dreamFile = `dream_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`;
    fs.writeFileSync(
      path.join(pendingDir, dreamFile),
      JSON.stringify({ ...dream, session: sessionId, created: new Date().toISOString() }, null, 2)
    );

    // Add dream_refs to referenced nodes
    addDreamRefs(dreamFile, dream.nodes_referenced || []);
  }

  // Process promotions
  for (const promo of result.promotions || []) {
    const srcPath = path.join(pendingDir, promo.dream_file);
    if (!fs.existsSync(srcPath)) continue;

    const dreamData = JSON.parse(fs.readFileSync(srcPath, "utf-8"));

    if (promo.new_confidence >= CONFIG.graph.dreamPromoteConfidence) {
      // Dream promotion: create a child node under the first referenced node
      const referencedNodes = dreamData.nodes_referenced || [];
      if (referencedNodes.length > 0) {
        promoteDreamToNode(dreamData, promo, referencedNodes[0]);
      }

      // Move to integrated
      const integratedDir = path.join(CONFIG.paths.dreams, "integrated");
      if (!fs.existsSync(integratedDir)) fs.mkdirSync(integratedDir, { recursive: true });

      dreamData.promoted_at = new Date().toISOString();
      dreamData.confidence = promo.new_confidence;
      dreamData.promotion_reason = promo.reason;

      fs.writeFileSync(path.join(integratedDir, promo.dream_file), JSON.stringify(dreamData, null, 2));

      // Remove dream_refs from referenced nodes
      removeDreamRefs(promo.dream_file, referencedNodes);

      fs.unlinkSync(srcPath);
    } else {
      dreamData.confidence = promo.new_confidence;
      fs.writeFileSync(srcPath, JSON.stringify(dreamData, null, 2));
    }
  }

  // Final enforcement pass in case promotions freed slots or counts drifted
  enforceHardCap();
  regenerateDreamContext();
}

/**
 * Add dream_refs to referenced nodes' frontmatter.
 */
export function addDreamRefs(dreamFile: string, nodesReferenced: string[]) {
  for (const nodePath of nodesReferenced) {
    const filePath = safePath(CONFIG.paths.nodes, nodePath, ".md");
    if (!filePath || !fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      const dreamRefs: string[] = parsed.data.dream_refs || [];
      if (!dreamRefs.includes(dreamFile)) {
        dreamRefs.push(dreamFile);
        parsed.data.dream_refs = dreamRefs;
        fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data));
        activityBus.log("graph:dream_linked", `Linked dream ${dreamFile} → ${nodePath}`);
      }
    } catch { /* skip */ }
  }
}

/**
 * Remove dream_refs from referenced nodes' frontmatter.
 */
export function removeDreamRefs(dreamFile: string, nodesReferenced: string[]) {
  for (const nodePath of nodesReferenced) {
    const filePath = safePath(CONFIG.paths.nodes, nodePath, ".md");
    if (!filePath || !fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      const dreamRefs: string[] = parsed.data.dream_refs || [];
      const idx = dreamRefs.indexOf(dreamFile);
      if (idx !== -1) {
        dreamRefs.splice(idx, 1);
        parsed.data.dream_refs = dreamRefs.length > 0 ? dreamRefs : undefined;
        fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data));
      }
    } catch { /* skip */ }
  }
}

/**
 * Promote a dream to a real child node under the referenced node path.
 */
export function promoteDreamToNode(
  dreamData: any,
  promo: { dream_file: string; reason: string; new_confidence: number },
  parentNodePath: string
) {
  // Create a sanitized name from the dream file
  const dreamName = promo.dream_file
    .replace(".json", "")
    .replace(/^dream_\d+_/, "dream_");

  const childPath = `${parentNodePath}/${dreamName}`;
  const filePath = safePath(CONFIG.paths.nodes, childPath, ".md");
  if (!filePath) return;

  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

  const now = new Date().toISOString().slice(0, 10);
  const fm: Record<string, any> = {
    id: childPath,
    title: `Dream: ${dreamData.type || "connection"}`,
    gist: (dreamData.fragment || "").slice(0, 200),
    confidence: promo.new_confidence,
    created: now,
    updated: now,
    decay_rate: 0.05,
    tags: ["dream", dreamData.type || "connection"],
    keywords: dreamData.nodes_referenced || [],
    edges: [{ target: parentNodePath, type: "derives_from", weight: 0.6 }],
    dream_origin: promo.dream_file,
  };

  const body = `# Dream: ${dreamData.type || "connection"}\n\n${dreamData.fragment}\n\n_Promoted: ${promo.reason}_`;
  fs.writeFileSync(filePath, matter.stringify(body, fm));

  activityBus.log("graph:node_created", `Dream promoted to node: ${childPath}`);
}

/**
 * Enforce hard cap on pending dreams. Archive lowest-confidence if over limit.
 */
export function enforceHardCap() {
  const pendingDir = path.join(CONFIG.paths.dreams, "pending");
  if (!fs.existsSync(pendingDir)) return;

  const pending = loadPendingDreams();
  const maxPending = CONFIG.graph.maxPendingDreams;

  if (pending.length <= maxPending) return;

  const sorted = [...pending].sort(
    (a, b) => (a.content.confidence || 0) - (b.content.confidence || 0)
  );
  const toArchive = sorted.slice(0, pending.length - maxPending);

  const archivedDir = path.join(CONFIG.paths.dreams, "archived");
  if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });

  for (const dream of toArchive) {
    try {
      const srcPath = path.join(pendingDir, dream.file);
      dream.content.archived_reason = "hard_cap";
      dream.content.archived_date = new Date().toISOString();
      fs.writeFileSync(path.join(archivedDir, dream.file), JSON.stringify(dream.content, null, 2));
      removeDreamRefs(dream.file, dream.content.nodes_referenced || []);
      fs.unlinkSync(srcPath);
    } catch { /* skip */ }
  }

  if (toArchive.length > 0) {
    activityBus.log("graph:dream_capped", `Hard cap: archived ${toArchive.length} lowest-confidence dreams`);
  }
}
