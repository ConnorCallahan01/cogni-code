#!/usr/bin/env node
import { buildCodexGraphMemoryHooks, upsertCodexHooks } from "./codex-hooks-config.js";

const [
  hooksPath,
  sessionStartCommand,
  userPromptCommand,
  assistantStopCommand,
  preToolUseCommand,
  postToolUseCommand,
  sessionStartCommandWindows,
  userPromptCommandWindows,
  assistantStopCommandWindows,
  preToolUseCommandWindows,
  postToolUseCommandWindows,
] = process.argv.slice(2);

if (!hooksPath || !sessionStartCommand || !userPromptCommand || !assistantStopCommand || !preToolUseCommand || !postToolUseCommand) {
  console.error("Usage: register-codex-hooks <hooksPath> <sessionStart> <userPrompt> <assistantStop> <preToolUse> <postToolUse> [sessionStartWindows userPromptWindows assistantStopWindows preToolUseWindows postToolUseWindows]");
  process.exit(1);
}

const hooks = buildCodexGraphMemoryHooks({
  sessionStart: { command: sessionStartCommand, ...(sessionStartCommandWindows ? { commandWindows: sessionStartCommandWindows } : {}) },
  userPrompt: { command: userPromptCommand, ...(userPromptCommandWindows ? { commandWindows: userPromptCommandWindows } : {}) },
  assistantStop: { command: assistantStopCommand, ...(assistantStopCommandWindows ? { commandWindows: assistantStopCommandWindows } : {}) },
  preToolUse: { command: preToolUseCommand, ...(preToolUseCommandWindows ? { commandWindows: preToolUseCommandWindows } : {}) },
  postToolUse: { command: postToolUseCommand, ...(postToolUseCommandWindows ? { commandWindows: postToolUseCommandWindows } : {}) },
});

const changed = upsertCodexHooks(hooksPath, hooks);
console.log(
  changed ? `Registered graph-memory Codex hooks in ${hooksPath}` : `graph-memory Codex hooks already up to date in ${hooksPath}`
);
