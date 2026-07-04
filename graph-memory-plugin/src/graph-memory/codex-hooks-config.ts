import fs from "fs";

export interface CodexHookCommand {
  type: "command";
  command: string;
  commandWindows?: string;
  timeout?: number;
  statusMessage?: string;
}

export interface CodexHookEntry {
  matcher?: string;
  hooks: CodexHookCommand[];
}

export interface CodexHooksFile {
  hooks: Record<string, CodexHookEntry[]>;
}

export interface CodexHookCommandSpec {
  command: string;
  commandWindows?: string;
}

const GRAPH_MEMORY_MARKER = "graph-memory";

function sameCommand(left: CodexHookCommand, right: CodexHookCommand): boolean {
  return (
    left.type === right.type &&
    left.command === right.command &&
    (left.commandWindows || "") === (right.commandWindows || "") &&
    (left.timeout || 0) === (right.timeout || 0) &&
    (left.statusMessage || "") === (right.statusMessage || "")
  );
}

function sameEntry(left: CodexHookEntry, right: CodexHookEntry): boolean {
  if ((left.matcher || "") !== (right.matcher || "")) return false;
  if (left.hooks.length !== right.hooks.length) return false;
  return left.hooks.every((hook, index) => sameCommand(hook, right.hooks[index]!));
}

function entryReferencesGraphMemory(entry: CodexHookEntry): boolean {
  return entry.hooks.some(
    (hook) =>
      hook.command.includes(GRAPH_MEMORY_MARKER) ||
      (hook.commandWindows || "").includes(GRAPH_MEMORY_MARKER)
  );
}

function commandHook(command: CodexHookCommandSpec, statusMessage: string, timeout = 600): CodexHookCommand {
  return {
    type: "command",
    command: command.command,
    ...(command.commandWindows ? { commandWindows: command.commandWindows } : {}),
    timeout,
    statusMessage,
  };
}

function entry(command: CodexHookCommandSpec, statusMessage: string, matcher?: string): CodexHookEntry {
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [commandHook(command, statusMessage)],
  };
}

export function buildCodexGraphMemoryHooks(commands: {
  sessionStart: CodexHookCommandSpec;
  userPrompt: CodexHookCommandSpec;
  assistantStop: CodexHookCommandSpec;
  preToolUse: CodexHookCommandSpec;
  postToolUse: CodexHookCommandSpec;
}): CodexHooksFile {
  return {
    hooks: {
      SessionStart: [
        entry(commands.sessionStart, "Loading graph-memory context", "startup|resume|clear|compact"),
      ],
      UserPromptSubmit: [
        entry(commands.userPrompt, "Capturing graph-memory prompt context"),
      ],
      Stop: [
        entry(commands.assistantStop, "Capturing graph-memory turn summary"),
      ],
      PreToolUse: [
        entry(commands.preToolUse, "Tracing graph-memory tool context"),
      ],
      PostToolUse: [
        entry(commands.postToolUse, "Tracing graph-memory tool result"),
      ],
    },
  };
}

export function mergeCodexHooks(existing: CodexHooksFile, graphMemoryHooks: CodexHooksFile): boolean {
  const hooksRoot =
    typeof existing.hooks === "object" && existing.hooks !== null
      ? existing.hooks
      : {};
  existing.hooks = hooksRoot;

  let changed = false;

  for (const [eventName, desiredEntries] of Object.entries(graphMemoryHooks.hooks)) {
    const currentEntries = Array.isArray(hooksRoot[eventName]) ? hooksRoot[eventName] : [];
    const kept = currentEntries.filter(
      (candidate) =>
        !entryReferencesGraphMemory(candidate) ||
        desiredEntries.some((desired) => sameEntry(candidate, desired))
    );

    if (kept.length !== currentEntries.length) {
      changed = true;
    }

    for (const desired of desiredEntries) {
      if (kept.some((candidate) => sameEntry(candidate, desired))) continue;
      kept.push(desired);
      changed = true;
    }

    hooksRoot[eventName] = kept;
  }

  return changed;
}

export function upsertCodexHooks(hooksPath: string, graphMemoryHooks: CodexHooksFile): boolean {
  const existing = fs.existsSync(hooksPath)
    ? (JSON.parse(fs.readFileSync(hooksPath, "utf8")) as CodexHooksFile)
    : { hooks: {} };
  const changed = mergeCodexHooks(existing, graphMemoryHooks);

  if (changed || !fs.existsSync(hooksPath)) {
    fs.writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + "\n");
  }

  return changed;
}
