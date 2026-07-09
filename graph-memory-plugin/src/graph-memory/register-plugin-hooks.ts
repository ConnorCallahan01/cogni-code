#!/usr/bin/env node
import { registerPluginHooks } from "./plugin-hooks.js";

const [settingsPath, hooksPath, nodeBin] = process.argv.slice(2);

if (!settingsPath || !hooksPath) {
  console.error("Usage: register-plugin-hooks <settingsPath> <hooksPath> [nodeBin]");
  process.exit(1);
}

const changed = registerPluginHooks(settingsPath, hooksPath, nodeBin);
console.log(
  changed
    ? "Registered plugin hooks in ~/.claude/settings.json"
    : "Plugin hooks already registered in ~/.claude/settings.json"
);
