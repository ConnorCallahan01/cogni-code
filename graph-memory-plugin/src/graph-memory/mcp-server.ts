#!/usr/bin/env node
/**
 * MCP server for graph-memory plugin.
 * Exposes the graph_memory tool and graph://map, graph://priors resources over stdio.
 *
 * Usage: node dist/graph-memory/mcp-server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initializeGraph, isGraphInitialized } from "./index.js";
import { handleGraphMemory, graphMemorySchema } from "./tools.js";
import fs from "fs";
import { CONFIG } from "./config.js";

// Initialize graph directory structure (creates dirs if missing, idempotent)
if (isGraphInitialized() || process.env.GRAPH_MEMORY_ROOT) {
  initializeGraph();
}

const server = new McpServer({
  name: "graph-memory",
  version: "1.0.0",
});

// Main tool
server.tool(
  "graph_memory",
  `Access the persistent knowledge graph. Actions: read_node, search, list_edges, read_dream, write_note, status, history, revert, consolidate, log_exchange, initialize.

RETRIEVAL GUIDANCE — follow these steps proactively:
1. At conversation start, read the MAP resource (graph://map) to see all known topics and their connections.
2. When the user mentions personal details, preferences, past events, or recurring topics, use the "search" action with relevant keywords to find matching nodes.
3. When a relevant node is found, use "list_edges" on that node to discover related nodes — birthdays link to people, preferences link to projects, etc.
4. Combine MAP overview + targeted search + edge traversal for comprehensive recall.

PIPELINE ACTIONS:
- consolidate: Run the full memory pipeline (scribe → librarian → dreamer → git commit). Call at session end.
- log_exchange: Buffer a user/assistant message pair for later processing. Use when hooks aren't available.

SETUP:
- initialize: First-time setup. Pass graphRoot to choose storage location (defaults to ~/.graph-memory/).`,
  graphMemorySchema,
  async (args) => {
    return handleGraphMemory(args);
  }
);

// Expose MAP and PRIORS as MCP resources
server.resource(
  "map",
  "graph://map",
  async (uri) => {
    const content = fs.existsSync(CONFIG.paths.map)
      ? fs.readFileSync(CONFIG.paths.map, "utf-8")
      : "_No MAP loaded. Run /graph-memory:memory-onboard to set up memory._";
    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
    };
  }
);

server.resource(
  "priors",
  "graph://priors",
  async (uri) => {
    const content = fs.existsSync(CONFIG.paths.priors)
      ? fs.readFileSync(CONFIG.paths.priors, "utf-8")
      : "_No priors loaded._";
    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
    };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
