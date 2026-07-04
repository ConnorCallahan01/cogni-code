import fs from "fs";
import path from "path";

export interface HookCommand {
  type: "command";
  command: string;
}

export interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

export interface PluginHooksFile {
  hooks: Record<string, HookEntry[]>;
}

export function loadPluginHooks(filePath: string): PluginHooksFile {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as PluginHooksFile;
}

const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";
const SH_HOOK_PATTERN = /\/bin\/([\w-]+)\.sh$/;

// bin/session-end.sh does more than "exec node <target>.js" — it captures
// stdin and spawns a detached background process so consolidation survives
// Claude Code exiting. That can't collapse to a 1:1 script-name mapping, so
// it gets a dedicated Windows launcher that replicates the same behavior in
// pure Node (see src/hooks/session-end-launcher.ts).
const WINDOWS_HOOK_OVERRIDES: Record<string, string> = {
  "session-end": "session-end-launcher",
};

function resolveCommand(command: string, pluginDir: string, nodeBin?: string): string {
  // Hook commands are shell strings. On Windows, fs.realpathSync returns
  // backslash paths, and a bare backslash is an escape character to the
  // shell (Git Bash / bash -c) that ends up running them — normalize to
  // forward slashes, which Windows file APIs accept just as well.
  const normalizedDir = process.platform === "win32" ? pluginDir.replaceAll("\\", "/") : pluginDir;
  const resolved = command.replaceAll(PLUGIN_ROOT, normalizedDir);

  if (process.platform !== "win32" || !nodeBin) return resolved;

  // bash.exe spawned bare (not via the Git Bash launcher) has no Git usr/bin
  // on PATH, so it can't even run `dirname` — the .sh wrappers fail before
  // they get anywhere near `node`. Bypass bash entirely: invoke node on the
  // compiled hook script directly with two absolute, quoted paths (no PATH
  // lookup needed at all).
  const match = resolved.match(SH_HOOK_PATTERN);
  if (!match) return resolved;

  const scriptName = WINDOWS_HOOK_OVERRIDES[match[1]!] ?? match[1];
  const jsPath = `${normalizedDir}/dist/hooks/${scriptName}.js`;
  return `"${nodeBin}" "${jsPath}"`;
}

function sameHookCommand(left: HookCommand, right: HookCommand): boolean {
  return left.type === right.type && left.command === right.command;
}

function sameHookEntry(left: HookEntry, right: HookEntry): boolean {
  if (left.matcher !== right.matcher) return false;
  if (left.hooks.length !== right.hooks.length) return false;
  return left.hooks.every((hook, index) => sameHookCommand(hook, right.hooks[index]!));
}

// Our own commands always embed the plugin's absolute directory. Used to
// distinguish entries this plugin registered (safe to replace on reinstall)
// from user- or other-plugin-owned entries (never touched).
function entryReferencesPlugin(entry: HookEntry, pluginDir: string): boolean {
  return pluginDir.length > 0 && entry.hooks.some((h) => h.command.includes(pluginDir));
}

export function mergeHooksIntoSettings(
  settings: Record<string, unknown>,
  pluginHooks: PluginHooksFile,
  pluginDir?: string,
  nodeBin?: string
): boolean {
  // Normalize once so it matches what resolveCommand() actually embeds in
  // commands (forward slashes on Windows) — comparing a raw backslash
  // fs.realpathSync() path against those commands would never match.
  const rawDir = pluginDir || "";
  const resolvedDir = process.platform === "win32" ? rawDir.replaceAll("\\", "/") : rawDir;
  const hooksRoot =
    typeof settings.hooks === "object" && settings.hooks !== null
      ? (settings.hooks as Record<string, unknown>)
      : {};

  settings.hooks = hooksRoot;

  let changed = false;

  for (const [eventName, entries] of Object.entries(pluginHooks.hooks)) {
    const existing = Array.isArray(hooksRoot[eventName]) ? (hooksRoot[eventName] as HookEntry[]) : [];

    const resolvedEntries: HookEntry[] = entries.map((rawEntry) => ({
      matcher: rawEntry.matcher,
      hooks: rawEntry.hooks.map((h) => ({
        type: h.type,
        command: resolveCommand(h.command, resolvedDir, nodeBin),
      })),
    }));

    // Drop this plugin's own entries that are stale (superseded by a
    // different command for the same event/matcher — e.g. the .sh-based
    // command an older install registered before the Windows bash-bypass
    // fix). Otherwise reinstalls pile up duplicates instead of replacing
    // them. User- or other-plugin-owned entries are never touched.
    const kept = existing.filter(
      (candidate) =>
        !entryReferencesPlugin(candidate, resolvedDir) ||
        resolvedEntries.some((resolved) => sameHookEntry(candidate, resolved))
    );
    if (kept.length !== existing.length) {
      changed = true;
    }

    for (const resolved of resolvedEntries) {
      if (kept.some((candidate) => sameHookEntry(candidate, resolved))) continue;
      kept.push(resolved);
      changed = true;
    }

    hooksRoot[eventName] = kept;
  }

  return changed;
}

export function registerPluginHooks(settingsPath: string, hooksPath: string, nodeBin?: string): boolean {
  const settings = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>)
    : {};
  const pluginHooks = loadPluginHooks(hooksPath);
  const pluginDir = fs.existsSync(hooksPath)
    ? fs.realpathSync(path.dirname(path.dirname(hooksPath)))
    : "";
  const changed = mergeHooksIntoSettings(settings, pluginHooks, pluginDir, nodeBin);

  if (changed || !fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }

  return changed;
}
