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

test("README documents every public slash command", () => {
  const readme = readText("README.md");
  const commandFiles = fs
    .readdirSync(path.join(pluginDir, "commands"))
    .filter((file) => file.endsWith(".md"));

  assert.ok(commandFiles.length > 0, "commands/ directory is empty");
  for (const file of commandFiles) {
    const name = file.replace(/\.md$/, "");
    assert.ok(readme.includes(`/${name}`), `README is missing /${name}`);
  }
});

// Claude Code's plugin schema rejects manifests with a string author, the
// legacy {name, description, file} component arrays, or an explicit hooks
// field duplicating the auto-discovered hooks/hooks.json — and a plugin that
// fails to load registers no hooks, which means no memory capture at all.
test("plugin manifest matches the current Claude Code plugin schema", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  const pkg = readJson("package.json");

  assert.equal(manifest.name, "graph-memory");
  assert.equal(
    manifest.version,
    pkg.version,
    "plugin.json version must match package.json — `claude plugin update` refreshes its cache by version, so a stale version ships stale code"
  );
  assert.equal(typeof manifest.author, "object", "author must be an object, not a string");
  assert.ok(manifest.mcpServers?.["graph-memory"], "graph-memory MCP server entry is missing");
  for (const legacyField of ["commands", "agents", "skills", "hooks"]) {
    assert.equal(
      manifest[legacyField],
      undefined,
      `plugin.json must not declare "${legacyField}" — those load via directory auto-discovery, and explicit entries fail current schema validation`
    );
  }
});

test("marketplace manifest declares the graph-memory plugin", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "cogni-code");
  assert.ok(
    marketplace.plugins.some((plugin) => plugin.name === "graph-memory" && plugin.source === "./"),
    "marketplace.json must list the graph-memory plugin rooted at the package"
  );
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
    ".claude-plugin/marketplace.json",
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
