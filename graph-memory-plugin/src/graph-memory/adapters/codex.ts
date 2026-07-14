import { HarnessAdapter, HarnessType } from "./types.js";
import { buildSessionStartContext, buildFullInjection, buildFallbackInjection, flushAndQueueJobs, cleanupSession } from "./shared.js";

export class CodexAdapter implements HarnessAdapter {
  name: HarnessType = "codex";

  async onSessionStart(cwd: string, sessionId: string): Promise<string> {
    const ctx = buildSessionStartContext(cwd, sessionId);

    if (ctx.mentalModelUsed) {
      return buildFullInjection(ctx.project);
    }

    return buildFallbackInjection(ctx.project);
  }

  async onSessionEnd(sessionId: string): Promise<void> {
    const { readActiveProject } = await import("../project.js");
    const active = readActiveProject();
    const project = active?.name || "global";
    flushAndQueueJobs(sessionId, project);
    cleanupSession(sessionId, project);
  }

  injectContext(text: string): void {
    process.stdout.write(text);
  }
}
