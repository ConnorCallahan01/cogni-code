# Graph Memory Plugin — Improvement Notes

From the perspective of the agent using this system. What's working, what's missing, what would make this genuinely useful across any project.

---

## 1. The Retrieval Tool Needs to Be Smarter

### Current state
`search` does keyword overlap on gists, tags, and keywords. That's it. If I search "birthday" I'll find nodes with "birthday" in them, but I won't find `user/preferences/structured_spontaneity` even though it's deeply relevant to how I should *approach* birthday planning.

### What's needed: Intent-aware retrieval

The tool should support **query types**, not just keyword search:

```
graph_memory({ action: "recall", query: "how does the user like things planned?" })
graph_memory({ action: "recall", query: "what do I know about the user's work?" })
graph_memory({ action: "recall", query: "context for: user is asking about restaurant options" })
```

This means the retrieval layer needs to:
1. Parse the query for **intent** (am I looking for a fact? a preference? context for a task?)
2. Match against node **categories** not just keywords (a query about "planning style" should hit all `user/preferences/*` nodes)
3. Follow edges automatically — if a hit has high-weight edges, include those neighbors in the response
4. Return a **compressed bundle** — not raw markdown, but a pre-digested summary sized for context efficiency

### Implementation idea
Run the query through a cheap Haiku call that maps it to relevant node paths + a retrieval strategy (direct, edge-walk, category scan). Then assemble the bundle server-side before returning to the agent. One tool call, one result, minimal context cost.

### The "context for:" prefix
This is the killer feature. When I'm about to respond to the user, I should be able to say:
```
graph_memory({ action: "recall", query: "context for: user wants help choosing a restaurant" })
```
And get back not just restaurant-related nodes, but the user's social style, food preferences (even if sparse), group size preferences, and the structured_spontaneity prior. Everything I need to respond *as someone who knows this person*.

---

## 2. Behavioral Memory — "What NOT to Do"

### The gap
There's no mechanism for storing **negative feedback** or **behavioral corrections**. If the user says "don't do that" or "I didn't like how you handled that," that signal currently evaporates at session end.

### What this should look like

A new node category: `corrections/` (or `behavior/corrections/`)

```yaml
---
id: corrections/dont_over_explain
title: Don't over-explain simple concepts
gist: "User pushed back when I gave a long explanation for something obvious. Keep it short."
confidence: 0.8
trigger: "explaining basic concepts"
severity: high
created: '2026-02-27'
edges:
  - target: user/preferences/legible_complexity
    type: reinforces
    weight: 0.7
soma:
  valence: negative
  intensity: 0.6
  marker: "User was mildly frustrated; course-correct immediately"
---
```

Key fields:
- **trigger**: What situation activates this correction (so retrieval can match against current context)
- **severity**: How important — "high" means always check, "low" means note but don't overcorrect
- **valence: negative** in soma — this is the somatic marker that says "this felt bad, avoid it"

### How it flows into the system

1. **Scribe detects correction signals** — phrases like "no, don't do that", "that's not what I meant", "too much", "I already know that", explicit "remember to always/never X"
2. **Librarian creates/updates a corrections node** — with trigger context so it's retrievable
3. **PRIORS.md gets updated** — high-confidence corrections should graduate into PRIORS (which already exists for this purpose but isn't being fed corrections)
4. **Retrieval surfaces them** — when the agent asks for context, relevant corrections are included with a clear signal: "AVOID: [correction]"

### The retrieval response format

When corrections exist that match the current context, they should appear prominently:

```
## Relevant corrections
- AVOID: Over-explaining simple concepts (confidence: 0.8, from 2 sessions ago)
- PREFER: Lead with the fun framing, logistics second (confidence: 0.9)

## Context nodes
- user/preferences/structured_spontaneity: [gist]
- user/social_style: [gist]
```

Corrections before context. Negative signal before positive signal. Because avoiding a known mistake is higher priority than adding nuance.

---

## 3. The PRIORS Pipeline Is One-Way

### Current state
PRIORS.md is hand-written or librarian-generated. But there's no mechanism for:
- Corrections to automatically become priors
- Priors to be demoted or removed when they stop being relevant
- The agent to propose a new prior based on repeated patterns

### What's needed
- **Correction → Prior promotion**: If a correction reaches high confidence (seen across 3+ sessions), auto-promote to PRIORS
- **Prior decay**: Priors that haven't been relevant in N sessions should get flagged for review
- **Prior proposal**: The librarian should be able to say "I've seen this pattern 4 times, proposing a new prior: [X]" and surface it for user approval

---

## 4. Project-Specific vs. User-Global Memory

### The problem
Right now the graph is monolithic. If I'm helping the user with a coding project AND personal planning, both live in the same graph. That's fine at 20 nodes. At 200 nodes across 5 projects, the MAP becomes noise.

### What's needed: Scoped retrieval

Two layers:
- **User graph** (`~/.graph-memory/user/`): Preferences, corrections, personal info, behavioral priors. Travels with the user across all projects.
- **Project graph** (`<project>/.graph-memory/`): Architecture decisions, code patterns, project-specific knowledge. Scoped to the repo.

The tool should merge both at retrieval time:
```
graph_memory({ action: "recall", query: "context for: user asks about API design" })
→ Returns: user priors + project-specific architecture nodes
```

The agent never has to think about which graph to query. The tool handles the merge.

---

## 5. Search Ranking Doesn't Reflect How I Actually Need Information

### Current scoring
`(gist_overlap * 3 + tag_overlap * 2 + keyword_overlap * 1) * confidence * recency * soma`

### What's missing

**Edge proximity scoring**: If node A matches the query and node B is connected to A with weight 0.9, node B should get a derived score even with zero keyword match. This is how I'd naturally traverse — find the hit, then pull in its neighborhood.

**Category boosting**: Queries about user behavior should automatically boost `user/*` and `corrections/*` nodes. Queries about a technical topic should boost `pattern/*` and project-scoped nodes.

**Frequency-of-access**: Nodes I read often are probably important. The `access_count` field exists but isn't used in ranking.

**Anti-edges**: The schema supports `anti_edges` but search ignores them. If node A has an anti-edge to node B, they should not appear together in results (they represent contradictions).

---

## 6. The Agent Can't Write Back Easily

### Current state
`write_note` drops a timestamped markdown file into a buffer. There's no way for me to:
- Create a new node directly
- Update an existing node's confidence or edges
- Propose a correction in-session
- Mark a node as "this is wrong" or "this needs updating"

### What's needed

```
graph_memory({ action: "annotate", path: "user/preferences/food", note: "User mentioned they love Thai food" })
graph_memory({ action: "correct", note: "User said: don't suggest chains, prefer local spots" })
graph_memory({ action: "update_confidence", path: "topic/openclaw", confidence: 0.2 })
```

These don't need to modify nodes immediately — they can be queued for the librarian. But the agent should be able to signal what it's learning *during* a conversation, not just hope the scribe catches it.

---

## 7. Dreams Are Invisible

### Current state
Dreams are stored in `dreams/pending/*.json` and appear truncated at the bottom of MAP.md. I can see fragments but can't act on them.

### What's needed
- Dreams should be surfaced in retrieval when they're relevant (not just listed in MAP)
- High-confidence dreams (>0.5) that have been reinforced should auto-promote to real nodes
- The agent should be able to `promote_dream` or `dismiss_dream` as actions

---

## 8. Session Context Handoff

### The problem
When a new session starts, I get MAP + PRIORS. But I don't know:
- What was the user working on last session?
- Were there any unfinished threads?
- Did the user express frustration or satisfaction with how things went?

### What's needed: Session summary node

After each consolidation, create/update a special node:

```yaml
---
id: _meta/last_session
title: Last Session Summary
gist: "User worked on graph memory improvements. Discussed retrieval tool design. Mood: collaborative and exploratory. Open threads: restaurant planning, openclaw clarification."
---
```

This node gets loaded with the MAP. Gives me continuity without the user having to re-explain.

---

## 9. Correction Detection Patterns

The scribe needs to recognize these signals and route them to the corrections pipeline:

### Explicit corrections
- "Don't do X" / "Stop doing X" / "Never X"
- "Remember to always X"
- "I prefer X over Y"
- "That's not what I meant" / "That's wrong"
- "Too [long/short/formal/casual/detailed/vague]"

### Implicit corrections
- User rephrasing their request (suggests first response missed the mark)
- User giving a short, flat response after a long agent response (suggests over-delivery)
- User switching topics abruptly after agent output (suggests disengagement)
- User doing the task themselves after asking for help (suggests agent approach was wrong)

### Positive reinforcement (not corrections, but same pipeline)
- "Perfect" / "Exactly" / "That's it"
- User building on agent's output (suggests good foundation)
- User showing enthusiasm (the "Ohhh" pattern we already track via soma)

All of these should feed into behavioral memory. Positive signals reinforce existing priors. Negative signals create or strengthen corrections.

---

## 10. The Hook System Needs to Feed the Graph

### Current state
The startup hook injects MAP + PRIORS into context. But there's no:
- **Post-response hook**: To log each exchange pair for the scribe
- **Session-end hook**: To trigger consolidation
- **Error hook**: To capture when the agent fails or gets corrected

### What's needed
The Claude Code hooks system (`settings.json`) should wire into the graph memory lifecycle:
- `PostToolUse` on every tool call → logs activity
- Session idle detection → triggers consolidation
- The `log_exchange` action should be called automatically, not manually

---

## 11. Conflict Resolution Between Nodes

### The problem
Two nodes can contradict each other and the system has no strategy for it. An old node says "user prefers casual tone" but a recent correction says "be more formal for work topics." Both are true — in different contexts. But retrieval just returns both and leaves the agent to figure it out.

### What's needed

A conflict resolution model with three layers:

1. **Scope-based resolution**: If the query has a clear context (work vs. personal), prefer nodes scoped to that context. A work-related query should weight `corrections/formal_for_work` over `user/preferences/casual_tone`.
2. **Recency + confidence tiebreaker**: When scope doesn't resolve it, prefer higher confidence first, then more recent. A correction from yesterday at 0.8 beats a preference from last month at 0.5.
3. **Explicit contradiction edges**: Nodes that directly contradict each other should be linked with a `contradicts` edge type. When one is retrieved, the system should check for contradictions and either pick the winner or surface both with a clear "CONFLICT:" label so the agent can decide.

The librarian should detect contradictions during consolidation and create these edges proactively, not wait for retrieval to stumble into them.

---

## 12. Forgetting / Garbage Collection

### The problem
The spec mentions decay, but there's no mechanism for actually removing stale nodes. The graph only grows. At 50 nodes the MAP is fine. At 200 nodes it's noise. Without pruning, the system degrades over time — the opposite of what memory should do.

### What's needed

A garbage collection pass during consolidation:

1. **Confidence floor**: Nodes below a threshold (e.g., 0.15) after decay get flagged for removal
2. **Access-based decay**: Nodes that haven't been retrieved or referenced in N sessions decay faster. The `access_count` field exists but isn't feeding back into confidence.
3. **Librarian-proposed deletions**: Rather than auto-deleting, the librarian should produce a `_meta/gc_candidates` node listing nodes proposed for removal, with reasons. The agent can surface this to the user: "I'm thinking about forgetting [X] — still relevant?"
4. **Protected nodes**: Some nodes (corrections, high-confidence priors) should be exempt from GC. A `protected: true` frontmatter flag.
5. **Archive, don't delete**: Removed nodes move to `archive/` rather than being destroyed. Git history helps, but an explicit archive is easier to browse and restore from.

### The MAP implication
As nodes are pruned, MAP.md shrinks. This is a feature — the MAP should represent current, relevant knowledge, not a historical record.

---

## 13. Multi-Agent Consistency (Scribe Conflicts)

### The problem
Parallel scribes can write deltas concurrently from the same session. Two scribes might extract conflicting information — one captures "user likes Thai food" and another captures "user said they're tired of Thai" from different parts of the same conversation. The librarian needs explicit merge rules.

### What's needed

1. **Timestamp ordering**: Every delta should carry the message range it was extracted from (e.g., messages 12-17). When deltas conflict, the later message range wins — it's more likely to reflect the user's final position.
2. **Same-field conflict detection**: If two deltas modify the same node field (e.g., both update `user/preferences/food`), the librarian should detect this and apply last-writer-wins based on message range.
3. **Cross-delta contradiction check**: Before applying deltas, the librarian should check if any new delta contradicts an existing node. If so, create a contradiction edge (#11) rather than silently overwriting.
4. **Scribe deduplication**: If two scribes extract the same fact (which is likely with overlapping message windows), the librarian should deduplicate before writing. Matching on node path + gist similarity.

This is mostly a librarian concern, not a scribe concern. Scribes should stay cheap and fast — the librarian absorbs the complexity.

---

## 14. Retrieval Budget / Token Awareness

### The problem
The "compressed bundle" idea in #1 is good, but there's no ceiling on how large a retrieval response can be. At 20 nodes, every recall fits easily. At 100+ nodes with edge traversal, a single "context for:" query could return 2000+ tokens of context — blowing up the agent's context window and drowning the actual conversation.

### What's needed

1. **Token budget parameter**: The recall tool should accept an optional budget:
   ```
   graph_memory({ action: "recall", query: "context for: restaurant choice", budget: 500 })
   ```
   Default to something reasonable (e.g., 800 tokens) if not specified.

2. **Progressive summarization**: If the raw bundle exceeds the budget, compress it in stages:
   - First: drop low-relevance nodes from the result set
   - Then: truncate gists to first sentence only
   - Finally: collapse related nodes into a single summary line

3. **Priority ordering within budget**: Corrections first, then direct hits, then edge-traversed context. If the budget forces cuts, context nodes get cut before corrections and direct matches.

4. **Budget metadata in response**: The tool should report back: `{ tokens_used: 487, tokens_budget: 500, nodes_included: 6, nodes_available: 12 }` so the agent knows if it's getting a partial view.

---

## 15. User-Facing Transparency

### The problem
The user has no way to see what the agent remembers about them, correct it directly, or opt out of specific memory categories. The system is a black box from the user's perspective. This erodes trust — especially when the agent acts on stale or wrong information.

### What's needed

1. **Profile summary action**:
   ```
   graph_memory({ action: "show_profile" })
   ```
   Returns a human-readable summary of what the system knows: preferences, corrections, open threads, key facts. Not raw YAML — a natural language summary the user can scan.

2. **User-initiated corrections**: The user should be able to say "forget that I like Thai food" or "update: I moved to New York" and have it route directly to the corrections/update pipeline, not wait for the scribe to maybe catch it.

3. **Category opt-out**: Some users won't want relationship status or personal details stored. A simple config (`memory_categories: [preferences, work, corrections]`) that tells the scribe what to extract and what to ignore.

4. **Memory diff on session start**: Optionally, when MAP + PRIORS are loaded, the agent can say "Since last time, I've updated: [list of changes]." This makes the memory system visible and correctable, not hidden.

---

## 16. Temporal Context in Retrieval

### The problem
Queries don't have a time dimension. "What was the user working on recently?" and "What does the user generally care about?" require fundamentally different retrieval strategies — one is recency-weighted, the other is confidence-weighted. The current system treats them the same.

### What's needed

1. **Temporal hints in queries**:
   ```
   graph_memory({ action: "recall", query: "what was user doing recently?", temporal: "recent" })
   graph_memory({ action: "recall", query: "user's core preferences", temporal: "stable" })
   ```
   - `recent`: Weight recency heavily, prefer nodes updated in last 1-3 sessions
   - `stable`: Weight confidence and access frequency, prefer long-lived high-confidence nodes
   - `default` (or omitted): Balanced scoring as-is

2. **Automatic temporal inference**: The "context for:" prefix should infer temporal mode from the query. "What were we just talking about?" → recent. "How does the user prefer things?" → stable. This can be part of the Haiku intent-parsing step from #1.

3. **Session-relative timestamps**: Nodes should track not just `created` and `updated` dates, but `last_session_referenced` — a session counter, not a wall-clock time. "3 sessions ago" is more meaningful than "February 24th" for determining staleness.

---

## Priority Order

(Updated with new items integrated)

If I had to pick the order to build these:

1. **Behavioral corrections** (#2, #9) — This is the biggest gap. Without it, I repeat mistakes across sessions.
2. **Intent-aware retrieval** (#1) — The "context for:" query pattern. Makes the graph actually useful during conversation.
3. **Conflict resolution** (#11) — Prerequisite for retrieval being trustworthy. Without it, contradictory nodes poison results.
4. **Agent write-back** (#6) — Let me signal what I'm learning in real-time.
5. **Session summary** (#8) — Cheap to implement, high continuity value.
6. **Retrieval budget** (#14) — Needs to be in place before the graph scales. Cheap to add now, painful to retrofit.
7. **PRIORS pipeline** (#3) — Makes corrections durable.
8. **Temporal context** (#16) — Elevates retrieval from keyword matching to actual understanding of "when."
9. **User transparency** (#15) — Trust-building. Matters more as the system stores more.
10. **Forgetting / GC** (#12) — Matters at scale, but the architecture should account for it early.
11. **Project scoping** (#4) — Matters at scale, not yet.
12. **Multi-agent consistency** (#13) — Edge case until scribe volume increases.
13. **Search ranking** (#5) — Incremental improvement.
14. **Dream surfacing** (#7) — Nice to have.
15. **Hook integration** (#10) — Infrastructure, not user-facing.
