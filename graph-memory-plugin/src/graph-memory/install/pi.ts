import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { resolvePkgRoot } from "./detect.js";

// pi loads extension packages listed in ~/.pi/agent/settings.json under
// "packages" — path entries relative to that directory, or npm:/git: specs.
// The package.json "pi" field tells pi which extensions/skills/prompts the
// package provides. `pi install <path>` writes exactly that settings record
// (idempotently), so prefer the CLI and fall back to writing settings.json
// directly when pi isn't on PATH.
export function installPi(piAgentDir: string): string[] {
  const messages: string[] = [];
  const pkgRoot = resolvePkgRoot();

  messages.push(...cleanupStalePackageEntries(piAgentDir, pkgRoot));

  const cli = runPi(["install", pkgRoot]);
  if (cli.ok) {
    messages.push("Registered extension package via pi CLI.");
  } else {
    messages.push("pi CLI not found on PATH — writing package registration directly.");
    messages.push(...registerDirect(piAgentDir, pkgRoot));
  }
  return messages;
}

function runPi(args: string[]): { ok: boolean; output: string } {
  try {
    const r = spawnSync("pi", args, {
      encoding: "utf-8",
      timeout: 240000,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    return { ok: !r.error && r.status === 0, output };
  } catch (err: any) {
    return { ok: false, output: err.message };
  }
}

function readSettings(settingsPath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    return {};
  }
}

function isOurPackageEntry(entry: string): boolean {
  return (
    entry.includes("cogni-code") ||
    entry.includes("graph-memory-plugin") ||
    /(^|[/:])graph-memory$/.test(entry)
  );
}

// Older registrations can point at a previous npm/Node-version path (dead
// after a Node switch) or at the npm registry copy (`npm:graph-memory`,
// the package's pre-rename name) — either way pi would load a stale or
// missing extension alongside the one we register. Drop every entry that is
// recognizably ours but does not resolve to the currently installed package.
function cleanupStalePackageEntries(piAgentDir: string, pkgRoot: string): string[] {
  const settingsPath = path.join(piAgentDir, "settings.json");
  const settings = readSettings(settingsPath);
  if (!Array.isArray(settings.packages)) return [];

  const kept = settings.packages.filter((entry: unknown) => {
    if (typeof entry !== "string") return true;
    if (!isOurPackageEntry(entry)) return true;
    if (entry.startsWith("npm:") || entry.startsWith("git:") || entry.includes("://")) return false;
    return path.resolve(piAgentDir, entry) === pkgRoot;
  });

  if (kept.length === settings.packages.length) return [];
  settings.packages = kept;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return ["Removed stale cogni-code package entries from pi settings."];
}

// Mirrors what `pi install <path>` writes: the package path relative to the
// pi agent directory, appended to "packages" if not already present.
function registerDirect(piAgentDir: string, pkgRoot: string): string[] {
  fs.mkdirSync(piAgentDir, { recursive: true });
  const settingsPath = path.join(piAgentDir, "settings.json");
  const settings = readSettings(settingsPath);
  if (!Array.isArray(settings.packages)) settings.packages = [];

  const alreadyRegistered = settings.packages.some(
    (entry: unknown) => typeof entry === "string" && path.resolve(piAgentDir, entry) === pkgRoot
  );
  if (!alreadyRegistered) {
    const relative = path.relative(piAgentDir, pkgRoot).split(path.sep).join("/");
    settings.packages.push(relative);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
  return [`Registered package in ${settingsPath}.`];
}
