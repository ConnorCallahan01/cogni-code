import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { activityBus } from "./events.js";

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokenEstimate?: number;
}

/**
 * Simplified BufferWatcher for v2 plugin context.
 *
 * No scribe firing — scribe runs as a background subagent triggered by
 * .scribe-pending marker files. This class only buffers and rotates.
 *
 * Core responsibilities:
 * - Buffer messages to conversation log
 * - Rotate buffer to snapshot when threshold reached
 * - Write .scribe-pending marker for subagent dispatch
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

    // Write .scribe-pending marker for subagent dispatch
    this.writeScribePending(snapshotPath);
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

  private writeScribePending(snapshotPath: string) {
    const marker = {
      snapshotPath,
      sessionId: this.sessionId,
      graphRoot: CONFIG.paths.graphRoot,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG.paths.scribePending, JSON.stringify(marker));
    activityBus.log("scribe:pending", `Scribe pending marker written for ${snapshotPath}`);
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
          this.writeScribePending(snapshotPath);
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
