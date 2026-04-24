import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { activityBus } from "./events.js";
import { enqueueJob } from "./pipeline/job-queue.js";

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokenEstimate?: number;
}

/**
 * Simplified BufferWatcher for v2 plugin context.
 *
 * No direct scribe firing from hooks. This class only buffers, rotates, and queues.
 *
 * Core responsibilities:
 * - Buffer messages to conversation log
 * - Rotate buffer to snapshot when threshold reached
 * - Queue scribe jobs for the background daemon
 */
export class BufferWatcher {
  private messageCount = 0;
  private totalSessionMessages = 0;
  private sessionId: string = "";

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
    const logPath = CONFIG.paths.conversationLog;
    const content = fs.readFileSync(logPath, "utf-8").trim();
    if (!content) return;

    // Rotate buffer to snapshot
    const snapshotPath = this.rotateBuffer(content);
    if (!snapshotPath) return;

    // Queue a scribe job for the background daemon
    this.queueScribe(snapshotPath);
  }

  private rotateBuffer(content?: string): string | null {
    try {
      const logPath = CONFIG.paths.conversationLog;

      if (!content) {
        content = fs.readFileSync(logPath, "utf-8").trim();
      }
      if (!content) return null;

      // Write snapshot for scribe input
      const snapshotName = `snapshot_${Date.now()}.jsonl`;
      const snapshotPath = path.join(CONFIG.paths.buffer, snapshotName);
      fs.writeFileSync(snapshotPath, content + "\n");

      // Clear the main buffer
      fs.writeFileSync(logPath, "");
      this.messageCount = 0;

      return snapshotPath;
    } catch (err) {
      activityBus.log("system:error", `Buffer rotation failed: ${err}`);
      return null;
    }
  }

  private queueScribe(snapshotPath: string) {
    const { created } = enqueueJob({
      type: "scribe",
      payload: {
        snapshotPath,
        sessionId: this.sessionId,
      },
      triggerSource: "buffer-watcher:threshold",
      idempotencyKey: `scribe:${snapshotPath}`,
    });
    activityBus.log("scribe:pending", `${created ? "Queued" : "Skipped duplicate"} scribe job for ${snapshotPath}`);
  }

  startSession() {
    this.messageCount = 0;
    this.totalSessionMessages = 0;
    this.sessionId = `session_${Date.now()}`;

    // Clear any stale buffer
    if (fs.existsSync(CONFIG.paths.conversationLog)) {
      fs.writeFileSync(CONFIG.paths.conversationLog, "");
    }

    activityBus.log("session:start", `New session started: ${this.sessionId}`);
  }

  /** Flush remaining buffer to snapshot for final scribe pass */
  flush(): string | null {
    if (this.messageCount > 0) {
      const logPath = CONFIG.paths.conversationLog;
      const content = fs.readFileSync(logPath, "utf-8").trim();
      if (content) {
        const snapshotPath = this.rotateBuffer(content);
        if (snapshotPath) {
          this.queueScribe(snapshotPath);
        }
        return snapshotPath;
      }
    }
    return null;
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
    };
  }
}
