import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const installerUrl = pathToFileURL(path.join(pluginDir, "dist/graph-memory/install/pi.js")).href;

// Runs installPi in a subprocess with a PATH that cannot resolve the `pi`
// CLI, exercising the direct settings.json fallback against a temp dir.
function runInstaller(piAgentDir) {
  const stdout = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { installPi } = await import(${JSON.stringify(installerUrl)});
        const messages = installPi(${JSON.stringify(piAgentDir)});
        process.stdout.write(JSON.stringify(messages));
      `,
    ],
    {
      cwd: pluginDir,
      encoding: "utf-8",
      env: { ...process.env, PATH: "/usr/bin:/bin" },
    }
  );
  return JSON.parse(stdout);
}

function readSettings(piAgentDir) {
  return JSON.parse(fs.readFileSync(path.join(piAgentDir, "settings.json"), "utf-8"));
}

test("fallback pi install registers the package in settings.json", () => {
  const piAgentDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-pi-install-")),
    ".pi",
    "agent"
  );

  runInstaller(piAgentDir);

  const settings = readSettings(piAgentDir);
  assert.equal(settings.packages.length, 1);
  assert.equal(path.resolve(piAgentDir, settings.packages[0]), pluginDir);

  // Idempotent re-run
  runInstaller(piAgentDir);
  assert.equal(readSettings(piAgentDir).packages.length, 1);
});

test("pi install drops stale cogni-code entries, keeps foreign packages and user settings", () => {
  const piAgentDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "graph-memory-pi-legacy-")),
    ".pi",
    "agent"
  );
  fs.mkdirSync(piAgentDir, { recursive: true });
  fs.writeFileSync(
    path.join(piAgentDir, "settings.json"),
    JSON.stringify({
      theme: "light",
      packages: [
        "npm:graph-memory",
        "npm:cogni-code",
        "../../old-nvm/node_modules/cogni-code",
        "npm:@someone/unrelated",
      ],
    })
  );

  runInstaller(piAgentDir);

  const settings = readSettings(piAgentDir);
  assert.equal(settings.theme, "light", "unrelated settings must survive");
  assert.deepEqual(
    settings.packages.filter((entry) => !entry.includes("cogni-code")),
    ["npm:@someone/unrelated"],
    "foreign packages must survive, legacy graph-memory specs must not"
  );
  const ours = settings.packages.filter((entry) => entry.includes("cogni-code"));
  assert.equal(ours.length, 1, "exactly one cogni-code entry should remain");
  assert.equal(path.resolve(piAgentDir, ours[0]), pluginDir);
});
