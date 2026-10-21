/**
 * Pipeline-scoped worker credentials.
 *
 * Reads `${graphRoot}/.env` — a dotenv-style file holding credentials that
 * belong to the memory pipeline alone (e.g. a LiteLLM virtual key scoped to a
 * local-model lane), kept separate from whatever the interactive shell or any
 * other agent on the box uses. Values here win over the ambient environment,
 * so the pipeline's credential is never silently replaced by one inherited
 * from the shell that happened to launch the daemon.
 *
 * The file lives inside the graph root, which Docker mode already mounts into
 * the container, so it reaches containerized workers with no extra wiring.
 */
import fs from "fs";
import path from "path";

/** Parse dotenv-style `KEY=VALUE` lines. Ignores blanks, comments, and malformed lines. */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The graph root is a git repo — a credentials file inside it must never be
 * committable. Append `.env` to its .gitignore if it is not already covered.
 */
function ensureEnvIgnored(graphRoot: string): void {
  const gitignorePath = path.join(graphRoot, ".gitignore");
  try {
    const existing = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, "utf-8")
      : "";
    const covered = existing
      .split(/\r?\n/)
      .some((l) => l.trim() === ".env" || l.trim() === "/.env");
    if (covered) return;
    const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    fs.appendFileSync(gitignorePath, `${prefix}.env\n`);
  } catch {
    /* best effort — never block a worker on gitignore upkeep */
  }
}

/**
 * Load the pipeline's own credentials from `${graphRoot}/.env`.
 * Returns an empty record when the file is absent — the default, so behavior
 * is unchanged unless the user opts in by creating it.
 */
export function loadWorkerEnv(graphRoot: string): Record<string, string> {
  const envPath = path.join(graphRoot, ".env");
  let contents: string;
  try {
    contents = fs.readFileSync(envPath, "utf-8");
  } catch {
    return {};
  }
  ensureEnvIgnored(graphRoot);
  return parseEnvFile(contents);
}

/** The ambient environment overlaid with the pipeline's own credentials. */
export function resolveWorkerEnv(graphRoot: string): NodeJS.ProcessEnv {
  return { ...process.env, ...loadWorkerEnv(graphRoot) };
}
