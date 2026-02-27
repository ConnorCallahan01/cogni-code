#!/usr/bin/env node
/**
 * UserPromptSubmit hook — captures each user message to the buffer.
 *
 * Receives JSON on stdin with:
 *   - prompt: the user's message text
 *   - session_id: Claude Code session ID
 *
 * Appends directly to conversation.jsonl.
 */
import fs from "fs";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";

async function main() {
  if (!isGraphInitialized()) return;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return;

  let input: { prompt?: string; session_id?: string };
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  if (!input.prompt) return;

  // Ensure buffer directory exists
  const bufferDir = CONFIG.paths.buffer;
  if (!fs.existsSync(bufferDir)) {
    fs.mkdirSync(bufferDir, { recursive: true });
  }

  const maxLen = 2000;
  const content = input.prompt.length > maxLen
    ? input.prompt.slice(0, maxLen) + "..."
    : input.prompt;

  const entry = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(CONFIG.paths.conversationLog, JSON.stringify(entry) + "\n");
}

main().catch(() => {
  process.exit(0);
});
