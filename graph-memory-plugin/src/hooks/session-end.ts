#!/usr/bin/env node
/**
 * Session end hook — runs the full consolidation pipeline.
 *
 * Called by Claude Code at conversation end via hooks.json.
 * Only runs in dedicated mode (ANTHROPIC_API_KEY set).
 * In piggyback mode, consolidation must be triggered via the agent.
 */
import fs from "fs";
import path from "path";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { initializeGraph } from "../graph-memory/index.js";
import { runLibrarian } from "../graph-memory/pipeline/librarian.js";
import { runDreamer } from "../graph-memory/pipeline/dreamer.js";
import { updateManifest } from "../graph-memory/manifest.js";
import { autoCommit } from "../graph-memory/git.js";

async function main() {
  if (!isGraphInitialized()) return;

  if (!CONFIG.pipeline.dedicatedMode) {
    console.error(
      "[graph-memory] Skipping session-end hook: no ANTHROPIC_API_KEY set. " +
      "Pipeline runs via the host agent (piggyback mode)."
    );
    return;
  }

  // Lockfile prevents duplicate runs (SessionEnd can fire twice)
  const lockPath = path.join(CONFIG.paths.graphRoot, ".consolidation.lock");
  if (fs.existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      const lockAge = Date.now() - lockData.pid_time;
      // If lock is fresh (< 5 min), another process is running — bail
      if (lockAge < 300_000) {
        console.error("[graph-memory] Consolidation already running (lockfile exists). Skipping.");
        return;
      }
      // Stale lock (> 5 min) — remove and proceed
      console.error("[graph-memory] Removing stale lockfile.");
    } catch {
      // Malformed lock — remove and proceed
    }
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, pid_time: Date.now() }));

  // Ensure lockfile is cleaned up on exit
  const removeLock = () => { try { fs.unlinkSync(lockPath); } catch {} };
  process.on("exit", removeLock);
  process.on("SIGTERM", () => { removeLock(); process.exit(0); });
  process.on("SIGINT", () => { removeLock(); process.exit(0); });

  initializeGraph();

  // Find ALL unprocessed delta files (any .json in .deltas/)
  const deltasDir = CONFIG.paths.deltas;
  if (!fs.existsSync(deltasDir)) return;

  const deltaFiles = fs.readdirSync(deltasDir)
    .filter(f => f.endsWith(".json"))
    .sort();

  if (deltaFiles.length === 0) {
    console.error("[graph-memory] No deltas found. Nothing to consolidate.");
    return;
  }

  console.error(`[graph-memory] Found ${deltaFiles.length} delta file(s) to consolidate.`);

  // Process each delta
  const processed: string[] = [];
  for (const deltaFile of deltaFiles) {
    const sessionId = deltaFile.replace(".json", "");

    // Quick sanity check: does it have scribes?
    const deltaPath = path.join(deltasDir, deltaFile);
    try {
      const raw = fs.readFileSync(deltaPath, "utf-8").trim();
      if (!raw) {
        console.error(`[graph-memory] Removing ${deltaFile}: empty file.`);
        try { fs.unlinkSync(deltaPath); } catch {}
        continue;
      }
      const data = JSON.parse(raw);
      const scribes = data.scribes || [];
      if (scribes.length === 0) {
        console.error(`[graph-memory] Removing ${deltaFile}: no scribes.`);
        try { fs.unlinkSync(deltaPath); } catch {}
        continue;
      }
    } catch {
      // Unreadable / malformed JSON — check age. If older than 1 day, remove.
      try {
        const stat = fs.statSync(deltaPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 24 * 60 * 60 * 1000) {
          console.error(`[graph-memory] Removing ${deltaFile}: unreadable and older than 24h.`);
          fs.unlinkSync(deltaPath);
        } else {
          console.error(`[graph-memory] Skipping ${deltaFile}: unreadable (keeping, < 24h old).`);
        }
      } catch {
        console.error(`[graph-memory] Skipping ${deltaFile}: unreadable.`);
      }
      continue;
    }

    console.error(`[graph-memory] Running consolidation for ${sessionId}...`);

    try {
      await runLibrarian(sessionId);
      await runDreamer(sessionId);
      processed.push(deltaFile);
      console.error(`[graph-memory] Consolidated ${sessionId}.`);
    } catch (err: any) {
      console.error(`[graph-memory] Consolidation failed for ${sessionId}: ${err.message}`);
      // Don't add to processed — keep the delta for retry
    }
  }

  // Clean up processed deltas and old buffer snapshots
  for (const f of processed) {
    try { fs.unlinkSync(path.join(deltasDir, f)); } catch {}
  }
  if (processed.length > 0) {
    console.error(`[graph-memory] Cleaned up ${processed.length} processed delta(s).`);
  }

  // Clean up buffer snapshots older than 7 days
  const bufferDir = CONFIG.paths.buffer;
  if (fs.existsSync(bufferDir)) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(bufferDir)) {
      if (!f.startsWith("snapshot_")) continue;
      const filePath = path.join(bufferDir, f);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
  }

  // After all deltas processed: update manifest and commit
  try {
    updateManifest();
    await autoCommit("session end (hook)");
    console.error("[graph-memory] Manifest updated, changes committed.");
  } catch (err: any) {
    console.error(`[graph-memory] Post-consolidation failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(`[graph-memory] Session end hook error: ${err.message}`);
  process.exit(0);
});
