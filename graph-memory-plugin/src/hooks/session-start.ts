#!/usr/bin/env node
/**
 * Session start hook — loads MAP and PRIORS into agent context.
 *
 * Called by Claude Code at conversation start via hooks.json.
 * Outputs to stdout which gets injected into the agent's context.
 */
import fs from "fs";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";

function main() {
  if (!isGraphInitialized()) {
    console.log(
      "[graph-memory] Memory not initialized. Run /graph-memory:memory-onboard to set up."
    );
    return;
  }

  const parts: string[] = [];

  // Load PRIORS (behavioral guidelines — loaded first to shape thinking)
  if (fs.existsSync(CONFIG.paths.priors)) {
    const priors = fs.readFileSync(CONFIG.paths.priors, "utf-8").trim();
    if (priors && !priors.includes("No priors yet")) {
      parts.push(priors);
    }
  }

  // Load MAP (knowledge index)
  if (fs.existsSync(CONFIG.paths.map)) {
    const map = fs.readFileSync(CONFIG.paths.map, "utf-8").trim();
    if (map && !map.includes("No nodes yet")) {
      parts.push(map);
    }
  }

  if (parts.length === 0) {
    console.log(
      "[graph-memory] Memory initialized but empty. It will grow from your conversations."
    );
    return;
  }

  // Output to stdout — this gets injected into the agent's context
  console.log(parts.join("\n\n---\n\n"));
}

main();
