import fs from "fs";
import path from "path";
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
  for (const manifest of listManifests()) {
    const currentHash = computeNodeContentHash(manifest.source_node);
    if (!currentHash || currentHash === manifest.content_hash) continue;

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
