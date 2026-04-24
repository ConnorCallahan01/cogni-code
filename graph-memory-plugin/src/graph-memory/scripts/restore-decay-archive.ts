import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { CONFIG, isGraphInitialized } from "../config.js";
import { initializeGraph } from "../index.js";
import { updateManifest } from "../manifest.js";
import { rebuildArchiveIndex, rebuildIndex, regenerateCoreContextFiles } from "../pipeline/graph-ops.js";

interface Options {
  apply: boolean;
  reason: string;
  archivedOnOrAfter?: string;
  restoreConfidence: number;
  limit?: number;
}

interface ArchiveEntry {
  path: string;
  archived_reason?: string;
  archived_date?: string | null;
  confidence?: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    reason: "decay",
    restoreConfidence: 0.5,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--reason" && next) {
      options.reason = next;
      i++;
    } else if (arg === "--archived-on-or-after" && next) {
      options.archivedOnOrAfter = next;
      i++;
    } else if (arg === "--restore-confidence" && next) {
      const value = Number(next);
      if (!Number.isNaN(value)) options.restoreConfidence = value;
      i++;
    } else if (arg === "--limit" && next) {
      const value = Number(next);
      if (!Number.isNaN(value)) options.limit = value;
      i++;
    }
  }

  return options;
}

function loadArchiveIndex(): ArchiveEntry[] {
  if (!fs.existsSync(CONFIG.paths.archiveIndex)) return [];
  return JSON.parse(fs.readFileSync(CONFIG.paths.archiveIndex, "utf-8"));
}

function shouldRestore(entry: ArchiveEntry, options: Options): boolean {
  if ((entry.archived_reason || "unknown") !== options.reason) return false;
  if (options.archivedOnOrAfter) {
    const archivedDate = (entry.archived_date || "").slice(0, 10);
    if (!archivedDate || archivedDate < options.archivedOnOrAfter) return false;
  }
  return true;
}

function archivePathFor(nodePath: string): string {
  return path.join(CONFIG.paths.archive, `${nodePath}.md`);
}

function nodePathFor(nodePath: string): string {
  return path.join(CONFIG.paths.nodes, `${nodePath}.md`);
}

function restoreEntries(entries: ArchiveEntry[], options: Options) {
  const nowIso = new Date().toISOString();
  const restored: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const entry of entries) {
    if (options.limit && restored.length >= options.limit) break;

    const archivePath = archivePathFor(entry.path);
    const nodePath = nodePathFor(entry.path);

    if (!fs.existsSync(archivePath)) {
      skipped.push({ path: entry.path, reason: "archive file missing" });
      continue;
    }

    if (fs.existsSync(nodePath)) {
      skipped.push({ path: entry.path, reason: "active node already exists" });
      continue;
    }

    const raw = fs.readFileSync(archivePath, "utf-8");
    const parsed = matter(raw);
    delete parsed.data.archived_reason;
    delete parsed.data.archived_date;
    parsed.data.confidence = Math.max(
      typeof parsed.data.confidence === "number" ? parsed.data.confidence : 0,
      options.restoreConfidence,
    );
    parsed.data.updated = nowIso.slice(0, 10);
    parsed.data.last_decay_at = nowIso;

    const destDir = path.dirname(nodePath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(nodePath, matter.stringify(parsed.content, parsed.data));
    fs.unlinkSync(archivePath);
    restored.push(entry.path);
  }

  return { restored, skipped };
}

function printSummary(entries: ArchiveEntry[], options: Options, restored?: string[], skipped?: Array<{ path: string; reason: string }>) {
  const heading = options.apply ? "Restore complete" : "Restore dry run";
  console.log(heading);
  console.log(`Graph root: ${CONFIG.paths.graphRoot}`);
  console.log(`Reason filter: ${options.reason}`);
  console.log(`Archived on or after: ${options.archivedOnOrAfter || "any"}`);
  console.log(`Restore confidence floor: ${options.restoreConfidence}`);
  console.log(`Matched entries: ${entries.length}`);

  if (!options.apply) {
    console.log("Sample matches:");
    for (const entry of entries.slice(0, 20)) {
      console.log(`- ${entry.path} (${entry.archived_date || "unknown"})`);
    }
    return;
  }

  console.log(`Restored: ${restored?.length || 0}`);
  console.log(`Skipped: ${skipped?.length || 0}`);
  if (restored && restored.length > 0) {
    console.log("Restored sample:");
    for (const nodePath of restored.slice(0, 20)) {
      console.log(`- ${nodePath}`);
    }
  }
  if (skipped && skipped.length > 0) {
    console.log("Skipped sample:");
    for (const item of skipped.slice(0, 10)) {
      console.log(`- ${item.path}: ${item.reason}`);
    }
  }
}

async function main() {
  if (!isGraphInitialized()) {
    initializeGraph();
  }

  const options = parseArgs(process.argv.slice(2));
  const archiveIndex = loadArchiveIndex();
  const matches = archiveIndex.filter((entry) => shouldRestore(entry, options));

  if (!options.apply) {
    printSummary(matches, options);
    return;
  }

  const { restored, skipped } = restoreEntries(matches, options);
  rebuildIndex();
  rebuildArchiveIndex();
  regenerateCoreContextFiles();
  updateManifest();
  printSummary(matches, options, restored, skipped);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
