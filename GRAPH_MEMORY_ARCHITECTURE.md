# Graph Memory Architecture — Analysis & Optimization Path

## Current System Flow

```
SESSION START
  │
  ├─ SessionStart hook loads MAP.md + PRIORS.md into agent context
  │
  ▼
DURING SESSION (hot path — every exchange)
  │
  ├─ UserPromptSubmit hook → appends user message to .buffer/conversation.jsonl
  ├─ Stop hook → appends assistant message to conversation.jsonl
  │
  ├─ Every 10 messages (5 exchanges):
  │     Buffer → Scribe (Haiku, ~$0.001)
  │     Scribe reads: MAP + summary chain + message fragment
  │     Scribe outputs: { summary, deltas[] }
  │     Deltas saved to .deltas/{session_id}.json
  │     Buffer rotated (snapshot saved, log cleared)
  │
  ▼
SESSION END (Ctrl+C / exit)
  │
  ├─ SessionEnd hook fires (detached via nohup)
  │
  ├─ For EACH unprocessed delta file:
  │     ├─ Librarian (Sonnet, ~$0.05-0.15 per run)
  │     │     Reads: MAP + PRIORS + all scribe deltas for this session
  │     │     Outputs: JSON with nodes_to_create[], nodes_to_update[],
  │     │              nodes_to_archive[], new_priors[], decayed_priors[]
  │     │     Applies: writes/updates .md node files, rebuilds MAP, updates PRIORS
  │     │
  │     ├─ Dreamer (Sonnet, ~$0.03-0.08 per run)
  │     │     Reads: MAP + session deltas + pending dreams
  │     │     Outputs: { dreams[], promotions[] }
  │     │     Writes: dream fragments to dreams/pending/*.json
  │     │
  │     └─ Delta file deleted after successful processing
  │
  ├─ Manifest updated
  ├─ Git auto-commit
  │
  ▼
NEXT SESSION START → loads updated MAP + PRIORS
```

## What's Accumulating — The Numbers (after ~6 sessions)

| Artifact | Count | Size | Budget | Status |
|----------|-------|------|--------|--------|
| Nodes | 43 | ~43 files | max 80 | Growing |
| MAP entries | 43 | ~4,000 tokens | max 5,000 | At limit |
| Dream fragments in MAP | 105 lines | ~4,000 tokens | — | **No budget** |
| MAP total | 192 lines | ~8,000 tokens | 5,000 | **60% over budget** |
| Pending dreams | 129 | 129 files | — | **Never pruned** |
| Integrated dreams | 54 | 54 files | — | Never cleared |
| Archived dreams | 0 | — | — | Archival not working |
| PRIORS | 30 | 30 lines | max 30 | At cap, with duplicates |

### Key observation

**Dreams are the primary growth problem, not nodes.** The MAP's token budget is 5,000 but it's at ~8,000 — and ~4,000 of that overage is dream fragments appended to the bottom. Every dreamer run adds 10-15 fragments. After 6 sessions, there are 183 dream files and 105 dream lines in the MAP.

The dreamer produces fragments like:
> "What if 'caramelized crust edge' (Pequod's style) is the KEY to user's entire professional strategy"

These are creative but low-signal. They're crowding out the actual knowledge index.

## The Five Problems

### 1. The librarian does too much

The librarian receives scribe deltas and then **re-invents the node operations from scratch**. It reads the MAP, reads the deltas, then generates a full JSON with `nodes_to_create` containing complete node definitions (path, title, gist, tags, keywords, edges, content).

But the scribe already did this work. A scribe `create_node` delta already contains:
```json
{
  "type": "create_node",
  "path": "user/food_preferences",
  "title": "User Food Preferences",
  "gist": "...",
  "tags": [...],
  "keywords": [...],
  "confidence": 0.7,
  "edges": [...],
  "content": "..."
}
```

The librarian then reads this delta and produces... essentially the same thing, but through a Sonnet call that takes 30-150 seconds and costs $0.05-0.15.

**The redundancy**: Scribe extracts structured deltas → Librarian re-processes those same deltas into the same structure → system applies the librarian's output.

**What the librarian SHOULD do**: Reason about the graph — detect duplicates, resolve conflicts, merge overlapping nodes, propose archival. Not re-generate node definitions.

### 2. Nodes accumulate redundant content

Looking at `user/preferences/legible_complexity` (103 lines):
- Lines 54-78: Original content with cross-domain evidence and behavioral implications
- Lines 83-89: "Pattern Reinforcement" — restates the same cross-domain evidence
- Lines 94-102: "Reinforcement: Visible Forgetting" — restates the pattern again

Each librarian run appends via `append_content` without checking if the information is already present. After several sessions, nodes become repetitive. There's no compaction step.

### 3. Dreams grow without bound

The dreamer produces 10-15 fragments per session. The archival mechanism checks if dreams are older than `dreamPendingMaxSessions` (5) days AND below `dreamMinConfidence` (0.2). But:
- Most dreams start at 0.3-0.5 confidence (above the 0.2 floor)
- The promotion threshold is 0.5, so dreams between 0.2 and 0.5 sit in pending forever
- Zero dreams have been archived
- Every dream gets listed in MAP.md, bloating it beyond its token budget

### 4. PRIORS duplicate because matching is fragile

The old `updatePriors` used exact substring matching to find decayed priors. The LLM would submit "Design memory for visible forgetting" as a decayed prior, but the existing line reads "Design memory systems for visible forgetting, not silent decay—user wants to see what's fading..." — no substring match, no removal. New prior added, old one stays. Result: 30 priors with ~5 near-duplicate pairs.

(Our latest fix addresses this with fuzzy matching, but the underlying issue remains: the librarian is asked to manage a text file by generating text strings that must match other text strings. This is inherently fragile.)

### 5. The MAP token budget is fiction

`CONFIG.graph.maxMapTokens = 5000` is enforced for node entries, but then dreams are appended unconditionally:

```typescript
// In fullRegenerateMAP():
// After carefully budgeting node entries to 5000 tokens...

// ...dreams are just appended with no budget check:
if (dreamHints.length > 0) {
  newMAP += `\n## Dreams\n\n`;
  newMAP += dreamHints.join("\n") + "\n";  // <-- unbounded
}
```

Result: MAP is 8,000 tokens. The first 4,000 are useful. The next 4,000 are dream fragments that the agent has to wade through every single message.

## What the Architecture Should Be

The core insight: **optimize how the agent compacts and reasons through memory, not how much it stores.**

### Principle: Depth encodes confidence

The graph should use filesystem depth as a semantic signal:

```
user/                                    ← category (not a node)
  preferences/                           ← subcategory
    legible_complexity.md                ← 0.85 — stable, cross-domain pattern
      legible_complexity/
        work_context.md                  ← 0.65 — specific: BAA strategy, progressive disclosure
        social_planning.md              ← 0.70 — specific: medium groups, parallel threads
        system_design.md                ← 0.60 — specific: memory architecture choices
```

**Shallower = more confident, more general.** The parent node holds the distilled pattern. Children hold the evidence — specific instances, domain applications, supporting observations. This creates a natural hierarchy for both storage and retrieval:

- **MAP includes only top-level nodes.** Children don't bloat the index. They're reachable via edge traversal when a query drills deeper.
- **Retrieval gets progressive detail.** A broad query ("what does the user prefer?") returns the parent gist. A specific query ("how does the user like work presented?") traverses to the child.
- **Compaction is structural, not textual.** Instead of appending content to a bloated parent, the librarian breaks off a child node. The parent stays tight. The child captures the specificity.
- **Confidence flows upward.** A parent's confidence is the weighted average of its children. If three domain-specific observations all support the same pattern, the parent grows more confident. If a child contradicts, the parent's confidence drops.
- **Decay is depth-aware.** Shallow, high-confidence nodes (core preferences, identity) decay very slowly. Deep, specific nodes (one-time observations, contextual details) decay faster. The graph naturally sheds specifics while preserving fundamentals.

**The librarian's graph structuring role:** On every run, the librarian should evaluate whether the current graph structure makes sense given new information. Key questions:

1. "Is this node doing too much?" → Break off child nodes for specific domains/contexts
2. "Are these sibling nodes really the same pattern?" → Merge into parent, keep specifics as children
3. "Does this new information belong at the parent level or as a child?" → Route to correct depth
4. "Has this child been reinforced enough to promote to a shallower node?" → Promote if warranted

This means the librarian isn't just creating/archiving nodes — it's actively **sculpting the graph topology** to keep it navigable as knowledge accumulates.

### Principle: Dreams are graph-connected, not MAP-inlined

Dreams shouldn't be IN the MAP, but they should be reachable FROM the MAP. Two mechanisms:

**1. Dream edges on nodes.** Each dream already tracks `nodes_referenced`. When a dream is created, the referenced nodes get a lightweight `dream_refs` entry in their frontmatter:

```yaml
# In user/food_preferences.md frontmatter:
dream_refs:
  - dream_1709312456_a3f2.json  # "caramelized crust as professional metaphor"
  - dream_1709315678_b7c1.json  # "deep dish patience maps to sales cycles"
```

When retrieval hits `user/food_preferences`, it can optionally surface these dream fragments. The dreams are discoverable through the same graph traversal that finds everything else — no special "dreams section" needed. The agent encounters them when they're relevant, not every time it reads the MAP.

**2. Single MAP reference line.** The MAP gets one line at the bottom:

```markdown
## Pending Dreams
12 fragments across 8 nodes. Query via `recall` with related topics to surface.
```

This tells the agent dreams exist (so it can choose to explore them) without dumping 100+ lines of speculative fragments into the always-loaded context. Cost: ~20 tokens instead of ~4,000.

**Dream lifecycle with graph connectivity:**

```
Dream created → dream_refs added to referenced nodes → stored in pending/
    │
    ├─ Retrieval hits a referenced node → dream surfaced in context
    ├─ Reinforced by new session evidence → confidence increases
    ├─ Promoted (confidence > 0.5) → becomes a real node (child of referenced parent)
    ├─ Stale + low confidence → archived, dream_refs cleaned from nodes
    │
    └─ Hard cap (max 20 pending) → lowest-confidence archived
```

When a dream promotes to a real node, it naturally enters the graph at the right depth — as a child of the node it was speculating about. The dream "What if legible complexity applies to the user's sales strategy?" becomes `user/preferences/legible_complexity/sales_context.md`. The speculative fragment graduates into structural knowledge.

### Principle: Separate mechanical operations from reasoning operations

Right now everything goes through LLM calls. Node creation, updating, archival, priors management, MAP building, dream management — all routed through Sonnet. But most of these are mechanical:

| Operation | Current | Should Be |
|-----------|---------|-----------|
| Apply scribe deltas to nodes | Librarian (Sonnet) | Direct code |
| Merge edges, tags, keywords | Librarian (Sonnet) | Direct code |
| Rebuild MAP from nodes | Code | Code (already is) |
| Renumber priors | Librarian (Sonnet) | Direct code |
| Detect duplicate nodes | Librarian (Sonnet) | Code (path + gist similarity) |
| Resolve contradictions | Librarian (Sonnet) | **Librarian (Sonnet)** |
| Propose node merges | Librarian (Sonnet) | **Librarian (Sonnet)** |
| Propose archival | Librarian (Sonnet) | **Librarian (Sonnet)** |
| Synthesize cross-session priors | Librarian (Sonnet) | **Librarian (Sonnet)** |
| Creative recombination | Dreamer (Sonnet) | **Dreamer (Sonnet)** |

The LLM should only handle what requires **judgment** — not data transformation.

### Proposed Architecture: Three-Phase Consolidation

```
PHASE 1: MECHANICAL APPLY (no LLM, instant)
  │
  ├─ Read scribe deltas
  ├─ For each delta:
  │     create_node → write .md file (if not exists) or merge into existing
  │     update_stance → update confidence, append note
  │     soma_signal → update soma marker
  │     create_edge → add edge to frontmatter
  │     update_confidence → adjust confidence value
  │
  ├─ Deduplicate: if two deltas target the same node path, merge them
  ├─ Rebuild MAP from node files
  ├─ Update index
  │
  ▼
PHASE 2: LIBRARIAN REASONING (Sonnet, focused)
  │
  ├─ Input: current MAP (post-phase-1) + session summary chain
  │  (NOT the raw deltas — the librarian sees the result, not the process)
  │
  ├─ Tasks (output is small, focused):
  │     1. STRUCTURE — Does the graph topology make sense?
  │        - Nodes too broad? → Break into parent + children
  │        - Siblings redundant? → Merge into shared parent
  │        - New info at wrong depth? → Relocate (move shallow→deep or deep→shallow)
  │        - Child reinforced enough? → Promote to shallower level
  │     2. MERGE — Overlapping nodes that should be one
  │     3. ARCHIVE — Low value, superseded, or decayed nodes
  │     4. CONTRADICTIONS — Create contradiction edges between conflicting nodes
  │     5. PRIORS — Propose new behavioral priors / remove stale ones
  │     6. COMPACT — Verbose nodes that need their content summarized
  │
  ├─ Output format (much smaller than current):
  │     {
  │       "restructure": [
  │         { "action": "break_off", "parent": "user/preferences/legible_complexity",
  │           "children": [
  │             { "path": "user/preferences/legible_complexity/work", "gist": "...", "content": "..." },
  │             { "path": "user/preferences/legible_complexity/social", "gist": "...", "content": "..." }
  │           ],
  │           "new_parent_content": "Concise pattern description without domain-specific detail" },
  │         { "action": "promote", "path": "user/preferences/legible_complexity/sales",
  │           "new_path": "work/sales_communication_style", "reason": "..." },
  │         { "action": "relocate", "path": "user/work_context",
  │           "new_path": "user/professional_context/general", "reason": "superseded by specific node" }
  │       ],
  │       "merge": [{ "absorb": "user/work_context", "into": "user/professional_context", "reason": "..." }],
  │       "archive": [{ "path": "...", "reason": "..." }],
  │       "contradictions": [{ "a": "...", "b": "...", "resolution": "..." }],
  │       "new_priors": ["..."],
  │       "remove_priors": ["..."],
  │       "compact": [{ "path": "...", "new_content": "..." }]
  │     }
  │
  ├─ Apply restructure/merge/archive/contradiction operations
  ├─ Update confidence: parent confidence = weighted avg of children
  ├─ Rebuild MAP (top-level nodes only; children reachable via edges)
  │
  ▼
PHASE 3: DREAMER (Sonnet, rate-limited)
  │
  ├─ Max 3-5 fragments per session (not 10-15)
  ├─ Input: MAP + summary chain (same as librarian)
  ├─ Each dream tracks nodes_referenced[]
  ├─ dream_refs added to referenced nodes' frontmatter
  ├─ Dreams discoverable via graph traversal, NOT inlined in MAP
  │
  ├─ Dream lifecycle:
  │     confidence > 0.5 after 3+ sessions → promote to child node
  │       (dream about food_preferences → user/food_preferences/sales_metaphor.md)
  │     confidence < 0.2 after 3 sessions → archive, clean dream_refs
  │     Hard cap: max 20 pending. Lowest-confidence archived when exceeded.
  │
  ▼
REBUILD
  ├─ MAP regenerated from top-level nodes only (no dreams, no deep children)
  ├─ MAP includes single line: "N pending dreams across M nodes"
  ├─ MAP respects token budget strictly
  ├─ Git commit
```

### Why This Is Better

**Librarian output shrinks from ~5,000-16,000 tokens to ~500-2,000 tokens.** The librarian isn't generating node definitions anymore — it's generating graph operations (restructure, merge, archive, compact). This fits comfortably in Sonnet's output window and costs less.

**Scribe work isn't wasted.** The scribe's structured deltas are applied directly. The scribe already generates high-quality node definitions — using Haiku at 1/60th the cost of Sonnet.

**The graph structures itself over time.** The librarian's restructuring role means the graph doesn't just accumulate — it organizes. Broad nodes break into parent + children. Redundant siblings merge. Specifics naturally settle deeper while patterns float to the top. The graph becomes more navigable as it grows, not less.

**Depth = retrieval efficiency.** MAP only loads top-level nodes. A query about "user preferences" returns the high-confidence parent gists (~50 tokens each). Only if the query is specific ("how does the user like work presentations?") does retrieval traverse to children. This is a natural token budget — the graph self-limits context cost by its own structure.

**MAP stays within budget.** Dreams are referenced via graph edges, not inlined. One summary line replaces 105 lines of fragments. The MAP drops from ~8,000 tokens back to ~4,000.

**Dreams are discoverable, not noisy.** Dreams connect to the nodes they speculate about. When retrieval hits `user/food_preferences`, it can surface the connected dream about "deep dish patience mapping to sales cycles." The dream appears when it's relevant, not every time the agent reads the MAP. When a dream is reinforced enough, it graduates into a real child node at the right depth.

**Nodes stay compact.** Instead of `append_content` bloating nodes with repeated observations, the librarian breaks specific observations into child nodes. The parent stays tight. Compaction catches any remaining bloat.

**Priors are managed structurally.** Instead of the librarian generating text strings that must fuzzy-match existing priors, the code manages a structured list. The librarian proposes additions/removals by semantic description, and the code handles the actual file operations.

## Immediate Fixes (Before Architecture Change)

These can be done now without restructuring:

### 1. Remove dream inlining from MAP, add reference line

Dreams should not be listed in the MAP. The MAP is the index the agent reads every message — 105 lines of speculative fragments don't belong there.

In `fullRegenerateMAP()`: replace the dream hints loop with a single summary line: `"N pending dreams across M nodes. Query via recall to surface."` Dreams remain stored and retrievable via graph traversal + the MCP tool.

### 2. Cap dreamer output

In the dreamer prompt: "Produce at most 3 dream fragments per session. Focus on the highest-quality connections."

In code: enforce `result.dreams = result.dreams.slice(0, 5)` after parsing.

### 3. Actually archive stale dreams

The current `archiveStaleDreams()` uses `dreamPendingMaxSessions * 24 * 60 * 60 * 1000` — treating sessions as days. But `dreamPendingMaxSessions = 5` means 5 days, not 5 sessions. Dreams accumulate faster than they age out.

Fix: track a session counter in dream files and archive after N consolidation passes, not N days.

Or simpler: hard cap pending dreams at 20. When exceeded, archive the lowest-confidence ones.

### 4. Add node content compaction

Before rebuilding MAP, scan nodes. If a node's markdown body exceeds 500 words, flag it. During the librarian pass, include these in the input with a request to summarize.

Or simpler: in `append_content` handling, check if the new content is substantially similar to existing content (word overlap > 60%) and skip the append.

### 5. Fix PRIORS deduplication

Already done in our last commit — fuzzy matching with 60% word overlap detection, proper renumbering, maxPriors enforcement.

## Relationship to GRAPH_MEMORY_IMPROVEMENTS.md

The improvements doc (written from the agent's perspective) identifies 16 gaps. Here's how they map to the architecture issues above:

| Improvement | Architecture Relevance |
|-------------|----------------------|
| #1 Intent-aware retrieval | Separate concern — retrieval quality, not consolidation |
| #2 Behavioral corrections | Scribe should detect correction signals → direct node write |
| #3 PRIORS pipeline | Phase 2 librarian handles this structurally |
| #4 Project vs user scope | Future scaling — not urgent at 43 nodes |
| #5 Search ranking | Retrieval concern, not consolidation |
| #6 Agent write-back | Direct node writes from MCP tool — bypasses the scribe entirely |
| #7 Dreams invisible | Fixed by removing dreams from MAP + surfacing via retrieval |
| #8 Session context handoff | Phase 2 librarian creates `_meta/last_session` node |
| #9 Correction detection | Scribe prompt enhancement |
| #10 Hook system | Already implemented |
| #11 Conflict resolution | Phase 2 librarian's contradiction detection |
| #12 Forgetting/GC | Phase 2 librarian's archive proposals + dream hard cap |
| #13 Multi-agent consistency | Phase 1 mechanical dedup handles this |
| #14 Retrieval budget | Retrieval concern; MAP staying within budget helps |
| #15 User transparency | MCP tool enhancement (`show_profile` action) |
| #16 Temporal context | Retrieval concern — session counter on nodes |

The biggest wins come from improvements #12 (forgetting/GC), #11 (conflict resolution), and #8 (session handoff) — all of which are handled by the restructured Phase 2 librarian.

## Cost Model

### Current (per session-end consolidation)
- Librarian: Sonnet, ~30-150s, 8K-16K output tokens → $0.05-0.15
- Dreamer: Sonnet, ~30-45s, 4K output tokens → $0.03-0.08
- **Total: ~$0.08-0.23 per session**
- With duplicates (double-fire bug, now fixed): doubled

### Proposed (per session-end consolidation)
- Phase 1: No LLM call → $0.00
- Librarian (Phase 2): Sonnet, ~10-30s, 500-2K output tokens → $0.01-0.04
- Dreamer (Phase 3): Sonnet, ~15-30s, 1K output tokens → $0.01-0.03
- **Total: ~$0.02-0.07 per session**

~70% cost reduction while capturing the same information.

## Implementation Priority

1. **Remove dream inlining from MAP** — Immediate, 10 lines of code, biggest context-window win. Replace with single reference line.
2. **Cap dreamer output + hard cap pending dreams** — Immediate, prompt change + enforce in code
3. **Dream-to-node graph connectivity** — Add `dream_refs` to node frontmatter so dreams are discoverable via traversal
4. **Restructure to three-phase consolidation** — The core optimization. Phase 1 mechanical apply, Phase 2 librarian reasoning, Phase 3 rate-limited dreamer.
5. **Depth-based graph restructuring** — Librarian prompt + `break_off`/`promote`/`relocate` operations. This is where the graph starts self-organizing.
6. **MAP depth awareness** — MAP only includes nodes up to depth N. Children reachable via edges. Confidence flows upward from children to parents.
7. **Node compaction** — After depth restructuring is in place, the librarian can compact verbose parents by breaking off children instead of summarizing text.
8. **Session handoff node** — Low cost addition to librarian prompt: `_meta/last_session` node with summary + open threads.
