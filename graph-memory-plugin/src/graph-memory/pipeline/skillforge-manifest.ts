import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { CONFIG } from "../config.js";
import { computeNodeContentHash } from "./skillforge-score.js";

export interface SkillforgeManifest {
  source_node: string;
  skill_name: string;
  generated_at: string;
  score: number;
  project: string;
  project_root: string | null;
  content_hash: string;
  files: {
    claude_command: string;
    opencode_command: string;
  };
  reference_nodes: string[];
  refresh_count: number;
  last_refreshed_at: string | null;
}

export function readManifest(fileName: string): SkillforgeManifest | null {
  const filePath = path.join(CONFIG.paths.skillforgeManifests, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SkillforgeManifest;
  } catch {
    return null;
  }
}

export function listManifests(): SkillforgeManifest[] {
  const dir = CONFIG.paths.skillforgeManifests;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readManifest(f))
    .filter((m): m is SkillforgeManifest => m !== null);
}

export interface DriftedManifest {
  manifest: SkillforgeManifest;
  fileName: string;
  currentHash: string;
  manifestHash: string;
}

export function findDriftedManifests(): DriftedManifest[] {
  const drifted: DriftedManifest[] = [];
  const REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

  for (const manifest of listManifests()) {
    if (manifest.last_refreshed_at) {
      const elapsed = Date.now() - new Date(manifest.last_refreshed_at).getTime();
      if (!Number.isNaN(elapsed) && elapsed < REFRESH_COOLDOWN_MS) continue;
    }

    const currentHash = computeNodeContentHash(manifest.source_node);
    if (!currentHash || currentHash === manifest.content_hash) continue;

    const nodeFullPath = path.join(CONFIG.paths.nodes, manifest.source_node + ".md");
    if (fs.existsSync(nodeFullPath)) {
      try {
        const raw = fs.readFileSync(nodeFullPath, "utf-8");
        const parsed = matter(raw);
        if (parsed.data?.archived === true) continue;
      } catch { /* skip check */ }
    }

    const sanitizedPath = manifest.source_node.replace(/\//g, "-");
    const fileName = `${sanitizedPath}.json`;
    drifted.push({
      manifest,
      fileName,
      currentHash,
      manifestHash: manifest.content_hash,
    });
  }
  return drifted;
}
