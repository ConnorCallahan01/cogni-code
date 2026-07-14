import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolvePkgRoot(): string {
  return path.join(__dirname, "..", "..", "..");
}

export interface HarnessInfo {
  id: string;
  name: string;
  configDir: string;
  detected: boolean;
}

export function detectHarnesses(): HarnessInfo[] {
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      configDir: path.join(home, ".claude"),
      detected: fs.existsSync(path.join(home, ".claude")),
    },
    {
      id: "codex",
      name: "Codex CLI",
      configDir: codexHome,
      detected: fs.existsSync(codexHome),
    },
    {
      id: "opencode",
      name: "OpenCode",
      configDir: path.join(home, ".config", "opencode"),
      detected: fs.existsSync(path.join(home, ".config", "opencode")),
    },
  ];
}
