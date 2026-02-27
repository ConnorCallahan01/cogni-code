#!/usr/bin/env node
/**
 * Stop hook — captures each user/assistant exchange and appends to the buffer.
 *
 * Receives JSON on stdin with:
 *   - last_assistant_message: the assistant's response text
 *   - transcript_path: path to the session JSONL for extracting the user message
 *   - session_id: Claude Code session ID
 *
 * Appends directly to conversation.jsonl (does NOT use BufferWatcher, which
 * resets the file on construction). Fires the scribe when the buffer reaches
 * the configured threshold.
 */
import fs from "fs";
import path from "path";
import { CONFIG, isGraphInitialized } from "../graph-memory/config.js";
import { fireScribe, saveScribeResult } from "../graph-memory/pipeline/scribe.js";

interface StopHookInput {
  session_id: string;
  last_assistant_message: string;
  hook_event_name: string;
}

interface BufferEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

async function main() {
  if (!isGraphInitialized()) return;

  // Read hook input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return;

  let input: StopHookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  if (!input.last_assistant_message) return;

  const maxLen = 2000;
  const truncate = (s: string) =>
    s.length > maxLen ? s.slice(0, maxLen) + "..." : s;

  // Ensure buffer directory exists
  const bufferDir = CONFIG.paths.buffer;
  if (!fs.existsSync(bufferDir)) {
    fs.mkdirSync(bufferDir, { recursive: true });
  }

  const logPath = CONFIG.paths.conversationLog;
  const now = new Date().toISOString();

  // Append assistant message (user message is captured by the UserPromptSubmit hook)
  const assistantEntry: BufferEntry = { role: "assistant", content: truncate(input.last_assistant_message), timestamp: now };
  fs.appendFileSync(logPath, JSON.stringify(assistantEntry) + "\n");

  // Check if we've hit the scribe threshold
  const bufferContent = fs.readFileSync(logPath, "utf-8").trim();
  const bufferLines = bufferContent.split("\n").filter(Boolean);
  const messageCount = bufferLines.length;

  // Fire scribe every N messages (counting individual messages, not pairs)
  const threshold = CONFIG.session.scribeInterval * 2; // scribeInterval is per-exchange, we have 2 messages per exchange
  if (messageCount >= threshold) {
    // Format as readable conversation for the scribe
    const fragment = bufferLines.map(line => {
      try {
        const entry: BufferEntry = JSON.parse(line);
        return `[${entry.role.toUpperCase()}]: ${entry.content}`;
      } catch {
        return line;
      }
    }).join("\n\n");

    // Rotate: save snapshot, clear buffer
    const snapshotName = `snapshot_${Date.now()}.jsonl`;
    fs.writeFileSync(path.join(bufferDir, snapshotName), bufferContent + "\n");
    fs.writeFileSync(logPath, "");

    // Derive scribe ID from session
    const sessionId = input.session_id || `hook_${Date.now()}`;
    const existingDeltas = fs.existsSync(CONFIG.paths.deltas)
      ? fs.readdirSync(CONFIG.paths.deltas).filter(f => f.startsWith(sessionId)).length
      : 0;
    const scribeId = `S${String(existingDeltas + 1).padStart(2, "0")}`;

    let map = "_No MAP loaded._";
    if (fs.existsSync(CONFIG.paths.map)) {
      map = fs.readFileSync(CONFIG.paths.map, "utf-8");
    }

    // Fire scribe (async but we await it before exiting)
    try {
      const result = await fireScribe({
        fragment,
        map,
        summaryChain: [],
        sessionId,
        scribeId,
        fragmentRange: [1, messageCount],
      });

      saveScribeResult({
        sessionId,
        scribeId,
        fragmentRange: [1, messageCount],
        result,
      });
    } catch (err: any) {
      // Non-fatal — buffer was already rotated, scribe just didn't run
      console.error(`[graph-memory] Scribe failed: ${err.message}`);
    }
  }
}

main().catch(() => {
  process.exit(0);
});
