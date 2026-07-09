#!/usr/bin/env node
/**
 * Windows-only stand-in for bin/session-end.sh's stdin-capture + nohup
 * backgrounding. bash.exe spawned bare (not via the Git Bash launcher) has
 * no coreutils on PATH, so the .sh wrapper can't run there — this replicates
 * the same "capture stdin, detach, exit fast so Claude Code doesn't block"
 * behavior in pure Node instead.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..", "..");
const logPath = path.join(pluginDir, ".consolidation.log");
const workerPath = path.join(__dirname, "session-end.js");

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);

  const log = fs.openSync(logPath, "a");
  try {
    const child = spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: ["pipe", log, log],
    });
    child.stdin!.end(input);
    child.unref();
  } finally {
    fs.closeSync(log);
  }
}

main().catch(() => {
  process.exit(0);
});
