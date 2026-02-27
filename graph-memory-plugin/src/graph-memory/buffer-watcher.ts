import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { activityBus } from "./events.js";
import { fireScribe, saveScribeResult, type ScribeResult } from "./pipeline/scribe.js";

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokenEstimate?: number;
}

/**
 * Simplified BufferWatcher for plugin context.
 *
 * No idle timer or farewell detection — session boundaries are handled by
 * hooks (Claude Code) or explicit consolidate calls (Agent SDK / claude.ai).
 *
 * Core responsibilities:
 * - Buffer messages to conversation log
 * - Fire scribe every N messages (fire-and-forget)
 * - flush() to finalize all pending scribes before consolidation
 */
export class BufferWatcher {
  private messageCount = 0;
  private totalSessionMessages = 0;
  private sessionId: string = "";
  private scribeCount = 0;
  private summaryChain: string[] = [];
  private scribeQueue: Promise<ScribeResult>[] = [];

  constructor() {
    this.ensureBufferDir();
    this.startSession();
  }

  private ensureBufferDir() {
    const bufferDir = CONFIG.paths.buffer;
    if (!fs.existsSync(bufferDir)) {
      fs.mkdirSync(bufferDir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.paths.conversationLog)) {
      fs.writeFileSync(CONFIG.paths.conversationLog, "");
    }
  }

  /** Append a message to the conversation log */
  appendMessage(entry: ConversationEntry) {
    if (!this.sessionId) {
      this.startSession();
    }

    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(CONFIG.paths.conversationLog, line);

    this.messageCount++;
    this.totalSessionMessages++;

    activityBus.log("buffer:message_added", `Buffer: ${this.messageCount}/${CONFIG.session.scribeInterval} messages (${entry.role})`, {
      role: entry.role,
      bufferCount: this.messageCount,
      totalSession: this.totalSessionMessages,
    });

    // Check scribe threshold
    if (this.messageCount >= CONFIG.session.scribeInterval) {
      this.onThresholdReached();
    }
  }

  private onThresholdReached() {
    const fragmentStart = this.totalSessionMessages - this.messageCount + 1;
    const fragmentEnd = this.totalSessionMessages;

    // Read current buffer content before rotation
    const logPath = CONFIG.paths.conversationLog;
    const content = fs.readFileSync(logPath, "utf-8").trim();

    if (!content) return;

    // Format the fragment as readable conversation
    const fragment = content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const entry: ConversationEntry = JSON.parse(line);
          return `[${entry.role.toUpperCase()}]: ${entry.content}`;
        } catch {
          return line;
        }
      })
      .join("\n\n");

    // Rotate buffer
    this.rotateBuffer(content);

    // Fire scribe asynchronously (fire-and-forget)
    this.scribeCount++;
    const scribeId = `S${String(this.scribeCount).padStart(2, "0")}`;

    let map = "_No MAP loaded._";
    if (fs.existsSync(CONFIG.paths.map)) {
      map = fs.readFileSync(CONFIG.paths.map, "utf-8");
    }

    const scribePromise = fireScribe({
      fragment,
      map,
      summaryChain: [...this.summaryChain],
      sessionId: this.sessionId,
      scribeId,
      fragmentRange: [fragmentStart, fragmentEnd],
    }).then((result) => {
      if (result.summary) {
        this.summaryChain.push(result.summary);
      }
      saveScribeResult({
        sessionId: this.sessionId,
        scribeId,
        fragmentRange: [fragmentStart, fragmentEnd],
        result,
      });
      return result;
    });

    this.scribeQueue.push(scribePromise);
  }

  private rotateBuffer(content?: string) {
    try {
      const logPath = CONFIG.paths.conversationLog;

      if (!content) {
        content = fs.readFileSync(logPath, "utf-8").trim();
      }
      if (!content) return;

      // Write snapshot for archival
      const snapshotName = `snapshot_${Date.now()}.jsonl`;
      const snapshotPath = path.join(CONFIG.paths.buffer, snapshotName);
      fs.writeFileSync(snapshotPath, content + "\n");

      // Clear the main buffer
      fs.writeFileSync(logPath, "");
      this.messageCount = 0;
    } catch (err) {
      activityBus.log("system:error", `Buffer rotation failed: ${err}`);
    }
  }

  startSession() {
    this.messageCount = 0;
    this.totalSessionMessages = 0;
    this.scribeCount = 0;
    this.summaryChain = [];
    this.scribeQueue = [];
    this.sessionId = `session_${Date.now()}`;

    // Clear any stale buffer
    if (fs.existsSync(CONFIG.paths.conversationLog)) {
      fs.writeFileSync(CONFIG.paths.conversationLog, "");
    }

    activityBus.log("session:start", `New session started: ${this.sessionId}`);
  }

  /** Flush all pending scribes — called before consolidation */
  async flush(): Promise<void> {
    // Fire scribe for any remaining buffer content
    if (this.messageCount > 0) {
      const fragmentStart = this.totalSessionMessages - this.messageCount + 1;
      const fragmentEnd = this.totalSessionMessages;

      const logPath = CONFIG.paths.conversationLog;
      const content = fs.readFileSync(logPath, "utf-8").trim();

      if (content) {
        const fragment = content
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              const entry: ConversationEntry = JSON.parse(line);
              return `[${entry.role.toUpperCase()}]: ${entry.content}`;
            } catch {
              return line;
            }
          })
          .join("\n\n");

        this.rotateBuffer(content);

        this.scribeCount++;
        const scribeId = `S${String(this.scribeCount).padStart(2, "0")}_final`;

        let map = "_No MAP loaded._";
        if (fs.existsSync(CONFIG.paths.map)) {
          map = fs.readFileSync(CONFIG.paths.map, "utf-8");
        }

        const finalScribe = fireScribe({
          fragment,
          map,
          summaryChain: [...this.summaryChain],
          sessionId: this.sessionId,
          scribeId,
          fragmentRange: [fragmentStart, fragmentEnd],
        }).then((result) => {
          if (result.summary) this.summaryChain.push(result.summary);
          saveScribeResult({
            sessionId: this.sessionId,
            scribeId,
            fragmentRange: [fragmentStart, fragmentEnd],
            result,
          });
          return result;
        });

        this.scribeQueue.push(finalScribe);
      }
    }

    // Await ALL pending scribes
    if (this.scribeQueue.length > 0) {
      activityBus.log("buffer:cleared", `Flushing ${this.scribeQueue.length} pending scribes...`);
      await Promise.allSettled(this.scribeQueue);
      activityBus.log("buffer:cleared", "All scribes flushed.");
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getStatus() {
    return {
      bufferCount: this.messageCount,
      totalSessionMessages: this.totalSessionMessages,
      scribeInterval: CONFIG.session.scribeInterval,
      sessionId: this.sessionId,
      pendingScribes: this.scribeQueue.length,
      summaryChainLength: this.summaryChain.length,
    };
  }
}
