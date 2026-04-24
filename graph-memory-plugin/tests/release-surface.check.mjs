import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(pluginDir, relativePath), "utf-8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

test("README documents every public slash command in the manifest", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  const readme = readText("README.md");

  for (const command of manifest.commands) {
    assert.ok(
      readme.includes(`/${command.name}`),
      `README is missing /${command.name}`
    );
  }
});

test("hooks manifest includes tracing hooks and self-allow rule", () => {
  const hooksFile = readJson("hooks/hooks.json");
  const hooks = hooksFile.hooks;

  assert.ok(
    hooks.SessionStart?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/session-start.sh")
    ),
    "SessionStart hook is missing"
  );
  assert.ok(
    hooks.UserPromptSubmit?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/on-user-message.sh")
    ),
    "UserPromptSubmit hook is missing"
  );
  assert.ok(
    hooks.Stop?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/on-assistant-response.sh")
    ),
    "Stop hook is missing"
  );
  assert.ok(
    hooks.PreToolUse?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/on-pre-tool-use.sh")
    ),
    "PreToolUse tracing hook is missing"
  );
  assert.ok(
    hooks.PreToolUse?.some(
      (entry) =>
        entry.matcher === "mcp__graph-memory__graph_memory" &&
        entry.hooks.some((hook) => hook.command.includes("\"permissionDecision\":\"allow\""))
    ),
    "graph_memory self-allow rule is missing"
  );
  assert.ok(
    hooks.PostToolUse?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/on-post-tool-use.sh")
    ),
    "PostToolUse tracing hook is missing"
  );
  assert.ok(
    hooks.SessionEnd?.some((entry) =>
      entry.hooks.some((hook) => hook.command === "${CLAUDE_PLUGIN_ROOT}/bin/session-end.sh")
    ),
    "SessionEnd hook is missing"
  );
});

test("npm pack publishes the required release files", () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-pack-cache-"));
  const raw = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--cache", cacheDir],
    {
      cwd: pluginDir,
      encoding: "utf-8",
      env: { ...process.env, npm_config_loglevel: "error" },
    }
  );

  const [packResult] = JSON.parse(raw);
  const publishedFiles = new Set(packResult.files.map((file) => file.path));

  for (const requiredPath of [
    ".claude-plugin/plugin.json",
    "README.md",
    "LICENSE",
    "bin/install.sh",
    "commands/memory-onboard.md",
    "agents/memory-onboarder.md",
    "hooks/hooks.json",
    "dist/graph-memory/mcp-server.js",
  ]) {
    assert.ok(publishedFiles.has(requiredPath), `Pack is missing ${requiredPath}`);
  }
});

test("built status command works before initialization", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-home-"));
  const tempGraph = path.join(tempHome, ".graph-memory-test");
  const toolsUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/tools.js")).href;

  const stdout = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        process.env.HOME = ${JSON.stringify(tempHome)};
        process.env.USERPROFILE = ${JSON.stringify(tempHome)};
        process.env.GRAPH_MEMORY_ROOT = ${JSON.stringify(tempGraph)};
        const { handleGraphMemory } = await import(${JSON.stringify(toolsUrl)});
        const result = await handleGraphMemory({ action: "status" });
        process.stdout.write(JSON.stringify(result));
      `,
    ],
    {
      cwd: pluginDir,
      encoding: "utf-8",
      env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, GRAPH_MEMORY_ROOT: tempGraph },
    }
  );

  const result = JSON.parse(stdout);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.initialized, false);
  assert.equal(payload.firstRun, true);
  assert.equal(payload.graphRoot, tempGraph);
});
