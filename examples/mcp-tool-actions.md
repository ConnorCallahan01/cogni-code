# MCP Tool Action Examples

The plugin exposes a single MCP tool named `graph_memory`. These examples cover every currently supported action.

## Setup And Runtime

### `initialize`

```text
graph_memory(action="initialize", graphRoot="~/work/graph-memory-data")
```

Creates the graph structure and writes the global pointer file.

### `configure_runtime`

```text
graph_memory(action="configure_runtime", runtimeMode="docker")
graph_memory(action="configure_runtime", runtimeMode="manual")
```

Optional Docker overrides:

```text
graph_memory(
  action="configure_runtime",
  runtimeMode="docker",
  containerName="graph-memory-daemon",
  imageName="graph-memory:latest",
  authVolume="graph-memory-auth",
  graphRootInContainer="/graph-memory",
  authPathInContainer="/codex-home",
  memoryLimit="4g",
  cpuLimit="2"
)
```

### `status`

```text
graph_memory(action="status")
```

Returns initialization state, graph root, active project, counts, runtime, and warnings.

## Write And Update Memory

### `remember`

```text
graph_memory(
  action="remember",
  path="preferences/code_review_style",
  title="Code Review Style",
  gist="Prefers direct findings first, summary second.",
  content="When reviewing code, lead with concrete bugs and risks before recap.",
  tags=["preferences", "review"],
  confidence=0.9,
  pinned=true,
  edges=[{ target: "user/identity", type: "relates_to", weight: 0.7 }],
  soma={ valence: "positive", intensity: 0.6, marker: "Strong preference for directness" }
)
```

### `write_note`

```text
graph_memory(action="write_note", note="Potential node split: onboarding docs vs runtime docs")
```

Writes a working note into the graph buffer without creating a durable node directly.

## Search And Recall

### `search`

```text
graph_memory(action="search", query="review style")
```

Basic keyword search over the graph index.

### `recall`

```text
graph_memory(action="recall", query="review style", depth=2)
```

Search plus edge traversal.

### `read_node`

```text
graph_memory(action="read_node", path="preferences/code_review_style")
```

Reads full node content and frontmatter.

### `list_edges`

```text
graph_memory(action="list_edges", path="preferences/code_review_style")
```

Lists the outgoing graph connections for a node.

### `read_dream`

```text
graph_memory(action="read_dream", path="dream_1772221083568_w47t.json")
```

Reads a pending or integrated dream fragment.

## Maintenance

### `consolidate`

```text
graph_memory(action="consolidate")
```

Runs the mechanical consolidation path and regenerates graph artifacts.

### `history`

```text
graph_memory(action="history")
```

Lists recent git commits for the graph root.

### `revert`

```text
graph_memory(action="revert", path="abc1234")
```

Reverts the graph to a previous commit.

### `resurface`

```text
graph_memory(action="resurface", path="archive/preferences/old_workflow")
```

Moves an archived node back into the active graph.
