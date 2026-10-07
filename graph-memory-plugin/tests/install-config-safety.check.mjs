import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const moduleUrl = (rel) => pathToFileURL(path.join(pluginDir, "dist/graph-memory/install", rel)).href;
const cliJs = path.join(pluginDir, "dist", "graph-memory", "cli.js");

// Call an installer in a subprocess whose PATH can't resolve any harness CLI,
// so only the file-writing paths run.
function runInstaller(rel, fn, args) {
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", `
    const mod = await import(${JSON.stringify(moduleUrl(rel))});
    process.stdout.write(JSON.stringify(mod[${JSON.stringify(fn)}](...${JSON.stringify(args)})));
  `], { cwd: pluginDir, encoding: "utf-8", env: { ...process.env, PATH: "/usr/bin:/bin" } });
  return JSON.parse(stdout);
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "install-config-"));
}

test("stripJsonComments keeps string contents, drops comments and trailing commas", async () => {
  const { stripJsonComments, readJsonConfig } = await import(moduleUrl("json-config.js"));
  const text = `{
    // a comment
    "url": "https://example.com/a//b", /* block */
    "tricky": "keeps ,} and // and \\" quotes",
    "list": [1, 2,],
  }`;
  assert.deepEqual(JSON.parse(stripJsonComments(text)), {
    url: "https://example.com/a//b",
    tricky: 'keeps ,} and // and " quotes',
    list: [1, 2],
  });

  const dir = tempDir();
  try {
    const p = path.join(dir, "c.json");
    assert.equal(readJsonConfig(p).status, "missing");
    fs.writeFileSync(p, '{"a": 1}');
    assert.deepEqual(readJsonConfig(p), { status: "ok", value: { a: 1 }, strict: true });
    fs.writeFileSync(p, '{"a": 1,}');
    assert.deepEqual(readJsonConfig(p), { status: "ok", value: { a: 1 }, strict: false });
    fs.writeFileSync(p, '{"a": ');
    assert.equal(readJsonConfig(p).status, "unreadable");
    fs.writeFileSync(p, "[1, 2]");
    assert.equal(readJsonConfig(p).status, "unreadable");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The real-world case: a hand-edited opencode.json with other MCP servers and
// a trailing comma (which opencode accepts). The old installer failed to parse
// it, treated it as missing, and replaced it with only the graph-memory entry.
test("opencode: a config opencode accepts but JSON.parse doesn't is never replaced", () => {
  const dir = tempDir();
  try {
    const configPath = path.join(dir, "opencode.json");
    const registered = `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "graph-memory": { "command": [${JSON.stringify(process.execPath)}, ${JSON.stringify(cliJs)}, "mcp"], "enabled": true, "type": "local" },
    "railway": { "command": ["railway", "mcp"], "enabled": true, "type": "local" },
    "other": { "type": "local", "command": ["npx", "-y", "other"], "enabled": true },
  }
}
`;
    fs.writeFileSync(configPath, registered);
    let messages = runInstaller("opencode.js", "installOpencode", [dir, pluginDir]);
    assert.equal(fs.readFileSync(configPath, "utf-8"), registered, "already registered: file untouched");
    assert.ok(messages.some((m) => m.startsWith("MCP already registered")), messages.join("\n"));

    const unregistered = `{
  // my servers
  "mcp": {
    "railway": { "command": ["railway", "mcp"], "enabled": true, "type": "local" },
  },
}
`;
    fs.writeFileSync(configPath, unregistered);
    messages = runInstaller("opencode.js", "installOpencode", [dir, pluginDir]);
    assert.equal(fs.readFileSync(configPath, "utf-8"), unregistered, "not registered: still untouched");
    const warning = messages.find((m) => m.startsWith("Warning:"));
    assert.match(warning, /comments or trailing commas/);
    assert.match(warning, /"graph-memory":/, "tells the user what to add");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("opencode: strict JSON keeps every other key, and a missing config is created", () => {
  const dir = tempDir();
  try {
    const configPath = path.join(dir, "opencode.json");
    fs.writeFileSync(configPath, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      model: "zai/x",
      mcp: { railway: { type: "local", command: ["railway", "mcp"], enabled: true } },
    }));
    runInstaller("opencode.js", "installOpencode", [dir, pluginDir]);
    const updated = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.equal(updated.$schema, "https://opencode.ai/config.json");
    assert.equal(updated.model, "zai/x");
    assert.deepEqual(updated.mcp.railway, { type: "local", command: ["railway", "mcp"], enabled: true });
    assert.deepEqual(updated.mcp["graph-memory"].command, [process.execPath, cliJs, "mcp"]);

    fs.rmSync(configPath);
    runInstaller("opencode.js", "installOpencode", [dir, pluginDir]);
    const created = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.equal(created.$schema, "https://opencode.ai/config.json");
    assert.ok(created.mcp["graph-memory"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("codex, pi, and Claude Code installers leave an unparseable config untouched", () => {
  const dir = tempDir();
  try {
    const broken = '{ "hooks": { "SessionStart": [ ';

    const codexDir = path.join(dir, "codex");
    fs.mkdirSync(codexDir);
    fs.writeFileSync(path.join(codexDir, "hooks.json"), broken);
    const codexMessages = runInstaller("codex.js", "installCodex", [codexDir]);
    assert.equal(fs.readFileSync(path.join(codexDir, "hooks.json"), "utf-8"), broken);
    assert.ok(codexMessages.some((m) => /hooks\.json isn't valid JSON/.test(m)), codexMessages.join("\n"));

    const piDir = path.join(dir, "pi");
    fs.mkdirSync(piDir);
    fs.writeFileSync(path.join(piDir, "settings.json"), broken);
    const piMessages = runInstaller("pi.js", "installPi", [piDir]);
    assert.equal(fs.readFileSync(path.join(piDir, "settings.json"), "utf-8"), broken);
    assert.ok(piMessages.some((m) => /settings\.json isn't valid JSON/.test(m)), piMessages.join("\n"));

    const claudeDir = path.join(dir, "claude");
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, "settings.json"), broken);
    const claudeMessages = runInstaller("claude-code.js", "installClaudeCode", [claudeDir]);
    assert.equal(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf-8"), broken);
    assert.ok(claudeMessages.some((m) => /settings\.json isn't valid JSON/.test(m)), claudeMessages.join("\n"));
    const registry = JSON.parse(fs.readFileSync(path.join(claudeDir, "plugins", "installed_plugins.json"), "utf-8"));
    assert.ok(registry.plugins["graph-memory@cogni-code"], "the files it can update are still registered");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
