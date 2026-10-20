import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const importModule = (name) => import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);

const PROJECT = "owner/a";

async function freshGraph(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const graphRoot = path.join(tmp, ".graph-memory");
  process.env.GRAPH_MEMORY_ROOT = graphRoot;
  const { reloadConfig } = await importModule("config.js");
  reloadConfig();
  const { initializeGraph } = await importModule("index.js");
  initializeGraph();
  return { tmp, graphRoot };
}

function projectRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", `https://github.com/${PROJECT}.git`], { cwd: dir });
  return dir;
}

// Each hook run gets an empty HOME, so it finds the test graph through
// GRAPH_MEMORY_ROOT alone.
function runHook(script, graphRoot, input) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hook-home-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home, GRAPH_MEMORY_ROOT: graphRoot };
  delete env.GRAPH_MEMORY_PIPELINE_CHILD;
  delete env.GRAPH_MEMORY_WORKER;
  try {
    return execFileSync(process.execPath, [path.join(pluginDir, "dist/hooks", script)], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      env,
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function refreshContext(out) {
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : "";
}

function sessionEntry(sessionId, { task, pickup, minutesAgo, files = [] }) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    sessionId,
    project: PROJECT,
    activityAt: at,
    firstCapturedAt: at,
    lastUpdatedAt: at,
    summaries: [],
    tasksWorkedOn: [task],
    commits: [],
    worked: [],
    didntWork: [],
    nextPickup: [pickup],
    recalledNodes: [],
    createdNodes: [],
    updatedNodes: [],
    keyFiles: files.map((file) => ({ path: file, role: "edited" })),
  };
}

async function writeWorkingState(sessions) {
  const { getProjectWorkingStatePath, ensureWorkingDirectories } = await importModule("working-files.js");
  ensureWorkingDirectories();
  const now = new Date().toISOString();
  fs.writeFileSync(getProjectWorkingStatePath(PROJECT), JSON.stringify({ project: PROJECT, createdAt: now, updatedAt: now, sessions }, null, 2));
}

async function updateEntry(sessionId, changes) {
  const { getProjectWorkingStatePath } = await importModule("working-files.js");
  const statePath = getProjectWorkingStatePath(PROJECT);
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  const entry = state.sessions.find((session) => session.sessionId === sessionId);
  Object.assign(entry, changes, { lastUpdatedAt: new Date().toISOString() });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function openSection(text) {
  const at = text.indexOf("## Also open in this project");
  return at === -1 ? "" : text.slice(at);
}

// Two sessions in one project shared one WORKING file showing whichever had
// the latest scribe, and the prompt hook re-sent it to both on every update:
// each session was handed the other's "Now" as its own.
test("each session gets its own handoff, and other open sessions are listed, not handed off", async () => {
  const { tmp } = await freshGraph("concurrent-render-");
  try {
    await writeWorkingState([
      sessionEntry("sess-a", { task: "Rewrite the one-pager", pickup: "Finish the one-pager", minutesAgo: 1, files: ["docs/onepager.md"] }),
      sessionEntry("sess-b", { task: "Harden the GX10 boxes", pickup: "Roll out GX10 hardening", minutesAgo: 5 }),
      sessionEntry("sess-d", { task: "Old work", pickup: "Resume the old work", minutesAgo: 24 * 60 }),
    ]);
    const { writeActiveProject } = await importModule("project.js");
    for (const id of ["sess-a", "sess-b", "sess-c"]) writeActiveProject(id, { name: PROJECT, cwd: tmp });
    const { renderWorkingForSession, readHandoffPickup } = await importModule("project-working.js");

    const b = renderWorkingForSession(PROJECT, "sess-b");
    assert.match(b, /\*\*From:\*\* this session/);
    assert.match(b, /Roll out GX10 hardening/);
    assert.doesNotMatch(b, /Finish the one-pager/, "another session's Now isn't this one's");
    assert.match(openSection(b), /`sess-a` .*Rewrite the one-pager — editing `docs\/onepager.md`/);
    assert.match(openSection(b), /`sess-c` .*nothing captured yet/);
    assert.doesNotMatch(openSection(b), /`sess-b`/, "a session doesn't list itself");

    // A new session picks up from the latest session that is no longer open.
    const c = renderWorkingForSession(PROJECT, "sess-c");
    assert.match(c, /\*\*From:\*\* session `sess-d`/);
    assert.match(c, /Resume the old work/);
    assert.doesNotMatch(c, /Finish the one-pager|Roll out GX10 hardening/);
    assert.match(openSection(c), /Rewrite the one-pager/);
    assert.match(openSection(c), /Harden the GX10 boxes/);
    assert.deepEqual(readHandoffPickup(PROJECT, "sess-c"), ["Resume the old work"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Session end removes a session's file, but a closed terminal never runs it.
test("a session idle past the open window is handed off like a closed one", async () => {
  const { tmp } = await freshGraph("concurrent-idle-");
  try {
    await writeWorkingState([
      sessionEntry("sess-a", { task: "Rewrite the one-pager", pickup: "Finish the one-pager", minutesAgo: 200 }),
    ]);
    const { writeActiveProject, listOpenSessions, OPEN_SESSION_WINDOW_MS } = await importModule("project.js");
    const { CONFIG } = await importModule("config.js");
    writeActiveProject("sess-a", { name: PROJECT, cwd: tmp });
    const stale = new Date(Date.now() - OPEN_SESSION_WINDOW_MS - 60_000);
    fs.utimesSync(path.join(CONFIG.paths.activeProjects, "sess-a.json"), stale, stale);

    assert.deepEqual(listOpenSessions(PROJECT), []);
    const { renderWorkingForSession } = await importModule("project-working.js");
    const c = renderWorkingForSession(PROJECT, "sess-c");
    assert.match(c, /\*\*From:\*\* session `sess-a`/);
    assert.match(c, /Finish the one-pager/);
    assert.doesNotMatch(c, /Also open in this project/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("mid-session refresh sends a session its own update and other sessions opening, never their progress", async () => {
  const { tmp, graphRoot } = await freshGraph("concurrent-refresh-");
  try {
    await writeWorkingState([
      sessionEntry("sess-a", { task: "Rewrite the one-pager", pickup: "Finish the one-pager", minutesAgo: 1 }),
      sessionEntry("sess-b", { task: "Harden the GX10 boxes", pickup: "Roll out GX10 hardening", minutesAgo: 5 }),
    ]);
    const { writeActiveProject, removeActiveProject } = await importModule("project.js");
    writeActiveProject("sess-a", { name: PROJECT, cwd: tmp });
    const cwd = projectRepo(path.join(tmp, "repo"));
    const start = runHook("session-start.js", graphRoot, { cwd, session_id: "sess-b" });
    assert.match(start, /Roll out GX10 hardening/, "session start (a resume) leads with the session's own handoff");
    assert.doesNotMatch(start, /Finish the one-pager/);

    const prompt = (text) => refreshContext(runHook("on-user-message.js", graphRoot, { cwd, session_id: "sess-b", prompt: text }));

    await updateEntry("sess-a", { nextPickup: ["Send the one-pager to Patrick"] });
    const afterOther = prompt("keep going on the rollout");
    assert.doesNotMatch(afterOther, /# WORKING/, "another session's progress isn't re-sent");
    assert.doesNotMatch(afterOther, /Send the one-pager to Patrick/);

    await updateEntry("sess-b", { nextPickup: ["Verify the GX10 doctor run"] });
    const afterOwn = prompt("what's next on the rollout");
    assert.match(afterOwn, /# WORKING — owner\/a/);
    assert.match(afterOwn, /Verify the GX10 doctor run/);
    assert.match(openSection(afterOwn), /Rewrite the one-pager/);
    assert.doesNotMatch(afterOwn, /Send the one-pager to Patrick/);

    writeActiveProject("sess-c", { name: PROJECT, cwd: tmp });
    const afterOpen = prompt("anything else running");
    assert.doesNotMatch(afterOpen, /# WORKING/);
    assert.match(afterOpen, /`sess-c` .*nothing captured yet/);

    removeActiveProject("sess-a");
    removeActiveProject("sess-c");
    const afterClose = prompt("and now");
    assert.match(afterClose, /No other session is open in this project now/);

    assert.equal(prompt("quiet turn"), "", "nothing changed, nothing sent");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the prompt hook keeps a session open for the others", async () => {
  const { tmp, graphRoot } = await freshGraph("concurrent-heartbeat-");
  try {
    const { listOpenSessions, OPEN_SESSION_WINDOW_MS } = await importModule("project.js");
    const { CONFIG } = await importModule("config.js");
    const cwd = projectRepo(path.join(tmp, "repo"));

    // Registered by its first prompt even if session start never ran.
    runHook("on-user-message.js", graphRoot, { cwd, session_id: "sess-a", prompt: "start" });
    assert.deepEqual(listOpenSessions(PROJECT).map((s) => s.sessionId), ["sess-a"]);

    const file = path.join(CONFIG.paths.activeProjects, "sess-a.json");
    const stale = new Date(Date.now() - OPEN_SESSION_WINDOW_MS - 60_000);
    fs.utimesSync(file, stale, stale);
    fs.rmSync(path.join(CONFIG.paths.buffer, "conversation-sess-a.jsonl"), { force: true });
    assert.deepEqual(listOpenSessions(PROJECT), []);

    runHook("on-user-message.js", graphRoot, { cwd, session_id: "sess-a", prompt: "back again" });
    assert.deepEqual(listOpenSessions(PROJECT).map((s) => s.sessionId), ["sess-a"]);
    assert.deepEqual(listOpenSessions(PROJECT, { excludeSessionId: "sess-a" }), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
