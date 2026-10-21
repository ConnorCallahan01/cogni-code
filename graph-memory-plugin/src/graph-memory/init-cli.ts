import path from "path";
import { saveGlobalConfig, reloadConfig } from "./config.js";
import { initializeGraph } from "./index.js";

// Pointing memory at a storage location happens only from the command line,
// where the user sees and approves it. It used to be a graph_memory action,
// which let a model re-point every later session at a directory it chose.

const USAGE = `Usage: cogni-code init [--graph-root <path>]

Creates the graph (default ~/.graph-memory) and points every harness at it.`;

export async function runInit(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  let graphRoot: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--graph-root" && i + 1 < argv.length) graphRoot = argv[++i];
    else if (argv[i].startsWith("--graph-root=")) graphRoot = argv[i].slice("--graph-root=".length);
    else {
      console.error(`cogni-code init: unknown option ${argv[i]}\n\n${USAGE}`);
      process.exit(1);
    }
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    console.error("cogni-code init: cannot determine home directory");
    process.exit(1);
  }

  const resolvedRoot = graphRoot
    ? path.resolve(graphRoot.replace(/^~/, home))
    : path.join(home, ".graph-memory");

  // Reject dangerous paths (prefix-based check)
  const normalized = resolvedRoot.replace(/\/+$/, "");
  const dangerous = ["/etc", "/usr", "/var", "/bin", "/sbin", "/lib", "/sys", "/proc"];
  if (normalized === "/" || dangerous.some(d => normalized === d || normalized.startsWith(d + "/"))) {
    console.error(`cogni-code init: refusing to initialize graph at system path: ${resolvedRoot}`);
    process.exit(1);
  }

  saveGlobalConfig(resolvedRoot);
  reloadConfig();
  initializeGraph();

  const tools = await import("./tools.js");
  const result = await tools.handleGraphMemory({ action: "status" });
  console.log(result.content[0].text);
}
