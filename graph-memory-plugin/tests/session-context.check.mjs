import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "../dist/graph-memory/frontmatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function importModule(name) {
  return import(pathToFileURL(path.join(pluginDir, "dist/graph-memory", name)).href);
}

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

function writeNode(graphRoot, nodePath, data, body = "Body.") {
  const file = path.join(graphRoot, "nodes", `${nodePath}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fm = Object.fromEntries(Object.entries({ id: nodePath, title: nodePath, confidence: 0.6, ...data }).filter(([, v]) => v !== undefined));
  fs.writeFileSync(file, matter.stringify(body, fm));
}

// The flat .index.json that session start, recall, and status read.
async function rebuildIndex() {
  const { rebuildIndex } = await importModule("pipeline/graph-ops.js");
  rebuildIndex();
}

function projectRepo(dir, ownerRepo) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", `https://github.com/${ownerRepo}.git`], { cwd: dir });
  return dir;
}

// The hooks exit early unless ~/.graph-memory-config.yml points at an
// initialized graph (isGraphInitialized ignores GRAPH_MEMORY_ROOT). CI has no
// such file and a developer's points at their real graph, so each hook run gets
// a HOME of its own that points at the test graph.
function runHook(script, graphRoot, input) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hook-home-"));
  fs.writeFileSync(path.join(home, ".graph-memory-config.yml"), `graphRoot: ${JSON.stringify(graphRoot)}\n`);
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

// An unscoped pin used to load into every project's sessions — Oliver's
// production rules showed up in cogni-code sessions.
test("pinned nodes load only in sessions of their own project", async () => {
  const { tmp, graphRoot } = await freshGraph("pins-scope-");
  try {
    writeNode(graphRoot, "procedures/a_rule", { gist: "A's rule", pinned: true, project: "owner/a" });
    writeNode(graphRoot, "procedures/b_rule", { gist: "B's rule", pinned: true, project: "owner/b" });
    writeNode(graphRoot, "corrections/unscoped_rule", { gist: "No project", pinned: true });
    await rebuildIndex();

    const { loadPinnedNodes } = await importModule("context-sections.js");
    assert.deepEqual(loadPinnedNodes("owner/a").map((n) => n.path), ["procedures/a_rule"]);
    assert.deepEqual(loadPinnedNodes("owner/b").map((n) => n.path), ["procedures/b_rule"]);
    assert.deepEqual(loadPinnedNodes("global"), [], "an unscoped pin loads nowhere");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("remember refuses a pin without a project and can scope an existing node", async () => {
  const { tmp, graphRoot } = await freshGraph("pins-remember-");
  try {
    const { handleGraphMemory } = await importModule("tools.js");
    const nodeFile = (p) => matter(fs.readFileSync(path.join(graphRoot, "nodes", `${p}.md`), "utf-8")).data;

    const refused = await handleGraphMemory({ action: "remember", path: "procedures/new_rule", gist: "Rule", pinned: true });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /project-scoped/);
    assert.equal(fs.existsSync(path.join(graphRoot, "nodes", "procedures/new_rule.md")), false, "nothing written");

    const created = await handleGraphMemory({ action: "remember", path: "procedures/new_rule", gist: "Rule", pinned: true, project: "owner/a" });
    assert.notEqual(created.isError, true, created.content?.[0]?.text);
    assert.equal(nodeFile("procedures/new_rule").project, "owner/a");
    assert.equal(nodeFile("procedures/new_rule").pinned, true);

    await handleGraphMemory({ action: "remember", path: "corrections/old_rule", gist: "Old rule" });
    const refusedMerge = await handleGraphMemory({ action: "remember", path: "corrections/old_rule", pinned: true, gist: "Old rule" });
    assert.equal(refusedMerge.isError, true);
    assert.notEqual(nodeFile("corrections/old_rule").pinned, true);

    const scoped = await handleGraphMemory({ action: "remember", path: "corrections/old_rule", pinned: true, gist: "Old rule", project: "owner/a" });
    assert.notEqual(scoped.isError, true, scoped.content?.[0]?.text);
    assert.equal(nodeFile("corrections/old_rule").project, "owner/a");
    assert.equal(nodeFile("corrections/old_rule").pinned, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("status names pinned nodes that have no project", async () => {
  const { tmp, graphRoot } = await freshGraph("pins-status-");
  try {
    writeNode(graphRoot, "corrections/unscoped_rule", { gist: "No project", pinned: true });
    writeNode(graphRoot, "procedures/scoped_rule", { gist: "Scoped", pinned: true, project: "owner/a" });
    await rebuildIndex();

    const { handleGraphMemory } = await importModule("tools.js");
    const status = JSON.parse((await handleGraphMemory({ action: "status" })).content[0].text);
    const warning = status.warnings.find((w) => /pinned node/.test(w));
    assert.ok(warning, `expected an unscoped-pin warning in ${JSON.stringify(status.warnings)}`);
    assert.match(warning, /corrections\/unscoped_rule/);
    assert.doesNotMatch(warning, /procedures\/scoped_rule/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("MAP ranks this project's nodes ahead of global ones, and keeps them when the budget is tight", async () => {
  const { tmp, graphRoot } = await freshGraph("map-rank-");
  try {
    for (let i = 0; i < 10; i++) {
      writeNode(graphRoot, `patterns/global_${i}`, { gist: `Global pattern ${i}`, confidence: 0.9 });
    }
    writeNode(graphRoot, "patterns/mine", { gist: "This project's pattern", confidence: 0.2, project: "owner/a" });
    for (const cat of ["architecture", "concepts", "decisions", "meta"]) {
      writeNode(graphRoot, `${cat}/global`, { gist: `A global ${cat} node with a long enough gist to cost something`, confidence: 0.9 });
    }
    writeNode(graphRoot, "projects/mine", { gist: "This project's arc", confidence: 0.5, project: "owner/a" });
    await rebuildIndex();

    const { buildProjectMap } = await importModule("context-sections.js");
    const full = buildProjectMap("owner/a", 100_000);
    assert.ok(full.indexOf("patterns/mine") < full.indexOf("patterns/global_"), "project node listed first despite lower confidence");

    const tight = buildProjectMap("owner/a", 250);
    assert.ok(tight.length <= 250, `MAP is ${tight.length} chars`);
    assert.match(tight, /patterns\/mine|projects\/mine/, "a tight MAP keeps a category holding this project's nodes");
    assert.doesNotMatch(tight, /## architecture/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Claude Code caps hook stdout at 10,000 characters and replaces anything
// longer with a 2,000-character preview: a 33k injection meant the agent saw
// the guardrails and WORKING and nothing else.
test("session-start output fits under Claude Code's hook cap and clips pinned nodes to their head", async () => {
  const { tmp, graphRoot } = await freshGraph("session-start-cap-");
  try {
    const { writeModel } = await importModule("mind/model.js");
    writeModel({
      model: {
        version: 3,
        generatedAt: new Date().toISOString(),
        cognitiveStyle: "Style. ".repeat(40),
        decisionPatterns: Array.from({ length: 3 }, (_, i) => `Decision pattern ${i} `.repeat(10)),
        preferences: Array.from({ length: 4 }, (_, i) => `Preference ${i} `.repeat(10)),
        guardrails: Array.from({ length: 6 }, (_, i) => `NEVER do thing ${i}; always verify first.`),
        emotionalProfile: "Engaged.",
        relationalNotes: [],
        tokenEstimate: 0,
      },
      lastCompressorRun: "",
      observationCount: 0,
    });

    for (let i = 0; i < 4; i++) {
      const body = `RULE-HEAD-${i}: the rule itself.\n\n` + `_Stance update ${i}:_ ${"history ".repeat(80)}\n\n`.repeat(8) + `TAIL-${i}`;
      writeNode(graphRoot, `procedures/pinned_${i}`, { gist: `Pinned ${i}`, pinned: true, project: "owner/a" }, body);
    }
    for (let i = 0; i < 300; i++) {
      const cat = ["architecture", "concepts", "decisions", "patterns", "projects"][i % 5];
      writeNode(graphRoot, `${cat}/node_${i}`, { gist: `Node ${i} `.repeat(20), project: i % 3 === 0 ? "owner/a" : undefined });
    }
    await rebuildIndex();
    fs.writeFileSync(path.join(graphRoot, "DREAMS.md"), "# DREAMS\n\n" + "dream ".repeat(3000));

    const cwd = projectRepo(path.join(tmp, "repo"), "owner/a");
    const out = runHook("session-start.js", graphRoot, { cwd, session_id: "cap-test" });

    assert.ok(out.length < 10_000, `session-start emitted ${out.length} chars`);
    assert.match(out, /Active project: owner\/a/);
    assert.match(out, /## Guardrails/);
    assert.match(out, /# PINNED/);
    assert.match(out, /RULE-HEAD-0/);
    assert.doesNotMatch(out, /TAIL-0/, "pinned node clipped to its head");
    for (let i = 0; i < 4; i++) {
      assert.ok(out.includes(`RULE-HEAD-${i}`) || out.includes(`procedures/pinned_${i}`), `pinned_${i} is injected or named`);
    }
    assert.match(out, /# MAP — Knowledge Graph Index/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("mid-session refresh re-sends what session start injects, not SOMA", async () => {
  const { tmp, graphRoot } = await freshGraph("refresh-");
  try {
    const { CONFIG } = await importModule("config.js");
    fs.writeFileSync(CONFIG.paths.soma, "# SOMA\n\nSOMA-MARKER");
    fs.writeFileSync(CONFIG.paths.map, "# MAP\n");

    const { writeSessionContextState } = await importModule("context-refresh.js");
    const cwd = projectRepo(path.join(tmp, "repo"), "owner/a");
    writeSessionContextState("refresh-test", "owner/a");

    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(CONFIG.paths.soma, later, later);
    fs.utimesSync(CONFIG.paths.map, later, later);

    const out = runHook("on-user-message.js", graphRoot, { cwd, session_id: "refresh-test", prompt: "what changed in the deploy pipeline today" });
    const context = JSON.parse(out).hookSpecificOutput.additionalContext;
    assert.match(context, /MAP Refresh/);
    assert.doesNotMatch(context, /SOMA-MARKER/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// A login shell's /etc/profile resets PATH and drops /opt/worker-clis, so
// status reported the installed codex fallback as "command not found" and the
// codex login/auth-status helpers couldn't find codex either.
test("container exec paths don't run a login shell", () => {
  const files = [
    path.join(pluginDir, "src/graph-memory/runtime.ts"),
    ...fs.readdirSync(path.join(pluginDir, "bin")).filter((f) => f.startsWith("docker-")).map((f) => path.join(pluginDir, "bin", f)),
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");
    assert.doesNotMatch(text, /bash -lc|"-lc"/, `${path.basename(file)} runs a login shell`);
  }
});
