import { simpleGit, type SimpleGit } from "simple-git";
import fs from "fs";
import { CONFIG } from "./config.js";
import { activityBus } from "./events.js";

let git: SimpleGit | null = null;

// Runtime state the pipeline writes under the graph root. It churns on every run,
// can hold raw conversation captures, external inputs, and credentials, and is not
// knowledge, so it stays out of the graph's history.
export const GRAPH_GITIGNORE_ENTRIES = [
  "/.buffer/",
  "/.deltas/",
  "/.jobs/",
  "/.pipeline/",
  "/.pipeline-logs/",
  "/.logs/",
  "/.sessions/",
  "/.session-context/",
  "/.active-projects/",
  "/.skillforge/",
  "/.inputs/",
  "/.env",
  "/.notion-*",
  "/.runtime-config.json",
  "/.preflight-report.json",
  "/*-debug.jsonl",
  "/.dirty-session",
  "/.plugin-loaded",
  "/.consolidation.lock",
  "/.scribe-pending",
  "/.dreamer-pending",
];

const GITIGNORE_HEADER = "# Runtime state, not knowledge (maintained by graph-memory)";

/** Append any missing GRAPH_GITIGNORE_ENTRIES to the graph's .gitignore, keeping existing lines. */
export function mergeGraphGitignore(graphRoot = CONFIG.paths.graphRoot): boolean {
  const gitignorePath = `${graphRoot}/.gitignore`;
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
  const lines = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = GRAPH_GITIGNORE_ENTRIES.filter((entry) => !lines.has(entry));
  if (missing.length === 0) return false;

  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  const header = lines.has(GITIGNORE_HEADER) ? "" : `${existing ? "\n" : ""}${GITIGNORE_HEADER}\n`;
  fs.writeFileSync(gitignorePath, existing + prefix + header + missing.join("\n") + "\n");
  return true;
}

/**
 * Initialize git repo in graph/ if not already one.
 * Returns the SimpleGit instance or null if git is disabled.
 */
async function getGit(): Promise<SimpleGit | null> {
  if (!CONFIG.git.enabled) return null;

  if (!git) {
    const graphRoot = CONFIG.paths.graphRoot;

    // Init repo if needed
    if (!fs.existsSync(`${graphRoot}/.git`)) {
      const freshGit = simpleGit(graphRoot);
      await freshGit.init();
      activityBus.log("git:commit", "Initialized git repo in graph/");

      mergeGraphGitignore(graphRoot);
      await freshGit.add(".gitignore");
      await freshGit.commit("memory: init graph repository");
    }

    git = simpleGit(graphRoot);
  }

  return git;
}

/**
 * Keep runtime state out of an existing graph repo: merge the ignore list into
 * .gitignore and untrack any tracked files it now matches, in one commit that
 * leaves every other pending change unstaged. Files stay on disk. Returns how
 * many files were untracked. Does nothing when git is disabled or the graph is
 * not a repo yet (getGit() creates the repo with the full ignore list).
 */
export async function ensureGraphGitHygiene(): Promise<number> {
  if (!CONFIG.git.enabled || !fs.existsSync(`${CONFIG.paths.graphRoot}/.git`)) return 0;
  const g = await getGit();
  if (!g) return 0;

  const listTrackedIgnored = async () =>
    (await g.raw(["ls-files", "--cached", "--ignored", "--exclude-standard"])).split("\n").filter(Boolean);

  const gitignoreChanged = mergeGraphGitignore();
  if (!gitignoreChanged && (await listTrackedIgnored()).length === 0) return 0;

  // Unstage whatever is left in the index (e.g. a worker's interrupted
  // `git add -A`) so this commit holds only the ignore list and the untracking.
  // The working tree is untouched; the next worker commit restages real changes.
  await g.raw(["reset", "-q"]);
  const tracked = await listTrackedIgnored();

  for (let i = 0; i < tracked.length; i += 200) {
    await g.raw(["rm", "--cached", "--quiet", "--", ...tracked.slice(i, i + 200)]);
  }
  await g.add(".gitignore");
  await g.commit(`${CONFIG.git.commitPrefix} stop tracking runtime state (${tracked.length} files)`);
  activityBus.log("git:commit", `Untracked ${tracked.length} runtime files from the graph repo`, {
    filesUntracked: tracked.length,
  });
  return tracked.length;
}

/**
 * Auto-commit all graph changes with a descriptive message.
 * Called at end of librarian consolidation.
 */
export async function autoCommit(summary?: string): Promise<void> {
  const g = await getGit();
  if (!g) return;

  try {
    const status = await g.status();

    // Nothing to commit
    if (status.isClean()) return;

    // Stage all graph changes (nodes, MAP, PRIORS, index, dreams)
    await g.add([
      "nodes/",
      "archive/",
      "dreams/",
      "MAP.md",
      "PRIORS.md",
      "SOMA.md",
      "WORKING.md",
      "DREAMS.md",
      "working/",
      ".index.json",
      ".archive-index.json",
      "manifest.yml",
    ]);

    // Re-check after staging
    const staged = await g.status();
    if (staged.staged.length === 0) return;

    // Build structured commit message
    const commitMsg = buildCommitMessage(staged, summary);
    await g.commit(commitMsg);

    activityBus.log("git:commit", `Git commit: ${commitMsg.split("\n")[0]}`, {
      filesChanged: staged.staged.length,
    });

    // Auto-push if configured
    if (CONFIG.git.autoPush) {
      try {
        const remotes = await g.getRemotes();
        if (remotes.length > 0) {
          await g.push(CONFIG.git.remote, CONFIG.git.branch);
          activityBus.log("git:push", `Pushed to ${CONFIG.git.remote}/${CONFIG.git.branch}`);
        }
      } catch (pushErr: any) {
        // Push failures are non-fatal (no remote configured is common)
        activityBus.log("git:error", `Push skipped: ${pushErr.message}`);
      }
    }
  } catch (err: any) {
    activityBus.log("git:error", `Auto-commit failed: ${err.message}`, {
      error: err.message,
    });
  }
}

/**
 * Build a structured commit message categorizing changes.
 */
function buildCommitMessage(status: any, summary?: string): string {
  const created: string[] = [];
  const updated: string[] = [];
  const archived: string[] = [];
  const meta: string[] = [];

  for (const file of status.staged) {
    if (file.startsWith("nodes/") && status.created?.includes(file)) {
      created.push(file);
    } else if (file.startsWith("nodes/")) {
      updated.push(file);
    } else if (file.startsWith("archive/")) {
      archived.push(file);
    } else {
      meta.push(file);
    }
  }

  // First line: summary
  const parts: string[] = [];
  if (created.length > 0) parts.push(`${created.length} new`);
  if (updated.length > 0) parts.push(`${updated.length} updated`);
  if (archived.length > 0) parts.push(`${archived.length} archived`);
  const statsStr = parts.length > 0 ? parts.join(", ") : `${status.staged.length} files`;

  let msg = `${CONFIG.git.commitPrefix} ${summary || "consolidation"} — ${statsStr}`;

  // Detailed body
  const body: string[] = [];
  if (created.length > 0) {
    body.push(`\nNew:`);
    for (const f of created) body.push(`  + ${f}`);
  }
  if (updated.length > 0) {
    body.push(`\nUpdated:`);
    for (const f of updated) body.push(`  ~ ${f}`);
  }
  if (archived.length > 0) {
    body.push(`\nArchived:`);
    for (const f of archived) body.push(`  - ${f}`);
  }
  if (meta.length > 0) {
    body.push(`\nMeta:`);
    for (const f of meta) body.push(`  * ${f}`);
  }

  if (body.length > 0) {
    msg += "\n" + body.join("\n");
  }

  return msg;
}

/**
 * List recent memory commits for recovery purposes.
 */
export async function listCommits(count = 10): Promise<Array<{
  hash: string;
  date: string;
  message: string;
}>> {
  const g = await getGit();
  if (!g) return [];

  try {
    const log = await g.log({ maxCount: count });
    return log.all.map(entry => ({
      hash: entry.hash,
      date: entry.date,
      message: entry.message,
    }));
  } catch {
    return [];
  }
}

/**
 * Revert the graph to a specific commit.
 * Creates a new revert commit rather than destructively resetting.
 */
export async function revertTo(commitHash: string): Promise<{ success: boolean; message: string }> {
  const g = await getGit();
  if (!g) return { success: false, message: "Git is disabled" };

  // Sanitize commit hash — must be 7-40 hex characters
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) {
    return { success: false, message: `Invalid commit hash format: ${commitHash}` };
  }

  try {
    // Validate the commit exists
    const log = await g.log({ maxCount: 50 });
    const target = log.all.find(e => e.hash.startsWith(commitHash));
    if (!target) {
      return { success: false, message: `Commit not found: ${commitHash}` };
    }

    // Get current HEAD for the revert message
    const currentHead = log.latest;

    // Checkout the target commit's files into the working tree
    // (without moving HEAD — then commit the result as a new revert commit)
    await g.checkout([commitHash, "--", "."]);

    // Stage everything
    await g.add(".");

    // Commit the revert
    const shortHash = commitHash.slice(0, 7);
    const revertMsg = `${CONFIG.git.commitPrefix} revert to ${shortHash} (${target.message})`;
    await g.commit(revertMsg);

    activityBus.log("git:commit", `Reverted to ${shortHash}: ${target.message}`, {
      targetHash: commitHash,
      previousHead: currentHead?.hash,
    });

    return { success: true, message: `Reverted to ${shortHash}: ${target.message}` };
  } catch (err: any) {
    activityBus.log("git:error", `Revert failed: ${err.message}`);
    return { success: false, message: `Revert failed: ${err.message}` };
  }
}
