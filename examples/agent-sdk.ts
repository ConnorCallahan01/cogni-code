import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  const pluginPath = path.resolve("./graph-memory-plugin");

  for await (const message of query({
    prompt: "Use memory to remember that I prefer direct code reviews.",
    options: {
      plugins: [{ type: "local", path: pluginPath }],
      allowedTools: ["mcp__graph-memory__graph_memory"],
      maxTurns: 6,
    },
  })) {
    if (message.type === "assistant") {
      console.log(JSON.stringify(message, null, 2));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
