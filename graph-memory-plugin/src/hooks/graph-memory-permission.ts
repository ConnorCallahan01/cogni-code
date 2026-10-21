#!/usr/bin/env node
// PreToolUse rule for graph_memory: answers "allow" for the read-only actions,
// so recall doesn't prompt. Anything that writes (remember, revert, compress,
// ...) gets no answer here, and the harness asks the user as it would for any
// tool. The rule used to allow every action.
const READ_ONLY_ACTIONS = new Set(["recall", "search", "read_node", "list_edges", "read_dream", "status", "history"]);

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  let input: any;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return;
  }

  const action = input?.tool_input?.action;
  if (typeof action === "string" && READ_ONLY_ACTIONS.has(action)) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));
  }
}

main().catch(() => {});
