# Graph Memory Roadmap

## Current State (2026-05-08)

| Metric | Value | Healthy? |
|--------|-------|----------|
| Active nodes | 756 | Too many |
| Archived nodes | 336 | OK |
| Nodes < 0.4 confidence | 387 (51%) | No — half the graph is low-value |
| Isolated nodes (no edges) | 22 (2%) | OK |
| Avg edges/node | 3.3 | OK |
| PRIORS size | 28,795 tokens | 10x over 2,500 budget |
| MAP size | 11,738 tokens | Acceptable |
| Total session injection | 93,200 tokens | 4x what it should be |
| Pinned nodes | 58 (48,189 tokens) | Massive — uncontrolled |
| Orphan snapshots | 192 (2.4 MB) | Scribe never cleaned them |
| Pending dreams | 20/20 (at cap) | Churning, rarely promoting |
| Skillforge manifests | 1 | Barely running |
| Pipeline jobs (total) | 726 done, 7 failed | Reliable |
| Librarian runtime | ~10-15 min per cycle | Expensive |
| Node creation rate | ~150/month | Too high — extraction too aggressive |

---

## Failure Points

### F1. Session injection is 93k tokens — 4x what it should be

**What the docs say:** "loads compact context artifacts like MAP.md and PRIORS.md"
**What actually happens:** The system injects 93,200 tokens before the user says a word:
- PRIORS: 28,795 tokens (the librarian prompt says "keep under 2,500" but nothing enforces it)
- MAP: 11,738 tokens
- Pinned nodes: 48,189 tokens (58 nodes, avg 830 tokens each)
- WORKING: 2,701 tokens
- SOMA: 1,189 tokens
- DREAMS: 554 tokens

**Why it happened:** No hard cap exists anywhere. The librarian prompt *suggests* 2,500 tokens for PRIORS but the regeneration code (`regenerateCoreContextFiles()`) writes whatever the librarian produces. Pinned nodes have a `maxPinnedTokens` config (5,000) but the session-start hook in `session-start.ts` checks per-node, not total. Each librarian pass adds to PRIORS without compressing.

**Impact:** Every session costs ~$0.10-0.15 in context tokens before the user speaks. On a typical day with 5-10 sessions, that's $1-2/day just in startup overhead. It also eats 25-50% of the context window, reducing the quality of the actual conversation.

**Solution:**
1. Hard-cap `regenerateCoreContextFiles()` — if PRIORS exceeds 2,500 tokens, truncate and log a warning
2. Implement total injection budget in session-start: `maxSessionStartTokens = 15,000`. Load files in priority order (PRIORS → MAP → SOMA → WORKING → DREAMS → pinned), stop when budget is hit
3. Fix pinned node budget enforcement — check total, not per-node
4. Add token accounting to the health endpoint so users can see what's being injected

### F2. PRIORS grew to 28k tokens — the "cognitive model" became an operations manual

**What the docs say:** "PRIORS.md is a cognitive model — it shapes HOW the agent thinks, not WHAT it knows"
**What actually happens:** PRIORS contains 28k tokens of detailed bug-fix narratives, commit-by-commit histories, specific product requirements, infrastructure debug procedures, and framework-specific workarounds. It reads like an engineering wiki, not a cognitive model.

Examples of what's in PRIORS that shouldn't be:
- "Next.js standalone bundler silently omits unresolvable packages" (framework-specific bug note)
- "Two-service parallel-path rule (2026-03-20)" (specific architecture detail)
- "Turn-budget ceilings are delivery architecture" (project-specific operational note)
- "Skill design: pass file paths, not binary payloads" (specific debug lesson)

**Why it happened:** The librarian adds to PRIORS whenever it detects a "repeated pattern across sessions." But the threshold is too low — a pattern mentioned twice across Keel3 sessions gets promoted to global PRIORS. Nothing removes PRIORS entries. Nothing checks total size.

**Solution:**
1. Hard truncation at 2,500 tokens in regeneration (see F1)
2. Add a PRIORS audit step to the librarian: "Review each PRIORS entry. If it describes a project-specific workaround (not a general cognitive pattern), demote it to a graph node and remove it from PRIORS."
3. Add a PRIORS entry age counter — entries unchanged after 60 days should be reviewed for demotion
4. Change the librarian's PRIORS rules: "Only add to PRIORS when a pattern appears across 3+ sessions AND 2+ projects. Project-specific patterns belong in graph nodes."

### F3. 387 nodes (51%) have confidence below 0.4 — the graph is full of noise

**What the docs say:** "Confidence should be evidence-based — Multiple sessions → high. Single mention → moderate."
**What actually happens:** The scribe creates nodes at 0.5 confidence by default. The auditor applies decay only to nodes with `decay_rate` set (many don't have it). Nodes created from a single session sit at 0.3-0.5 confidence forever.

Confidence distribution:
- < 0.2: 1 node
- 0.2-0.4: 387 nodes (the problem)
- 0.4-0.6: 87 nodes
- 0.6-0.8: 121 nodes
- 0.8+: 160 nodes

**Why it happened:** The auditor's decay logic (step 3D in the prompt) only reduces confidence for nodes "not updated in 30 days AND have decay_rate set." Many nodes were created before `decay_rate` was added to the default frontmatter. The scribe creates aggressively (8.8 deltas per session average) and the librarian doesn't have time to consolidate everything.

**Solution:**
1. Set `decay_rate: 0.05` as default on all new nodes (in the scribe delta schema)
2. Add a migration: backfill `decay_rate: 0.05` on existing nodes that lack it
3. Lower the archive threshold from 0.15 to 0.2 — nodes below 0.2 should be archived
4. Add a "confidence sweep" to the auditor: any node below 0.3 that hasn't been accessed in 14 days → archive it
5. Track "node access" more aggressively — every `read_node`, `recall`, or `search` hit should update `last_accessed`

### F4. 192 orphan snapshots consuming 2.4 MB

**What the docs say:** The scribe prompt says "delete the snapshot file when complete."
**What actually happens:** The daemon's `scavengeStaleBuffers()` converts stale conversation buffers into snapshot files and enqueues scribe jobs. But when the scribe fails or the job is lost, the snapshot stays forever. 192 snapshots from March through May have accumulated.

The scavenger only handles `conversation-*` files. Snapshot files have no cleanup path.

**Why it happened:** No failure recovery for orphaned snapshots. The scribe is supposed to delete on success, but if the job fails, the snapshot is never retried or cleaned up.

**Solution:**
1. Add snapshot cleanup to the daemon tick: any snapshot file older than 4 hours that doesn't have a corresponding queued/running scribe job → delete it
2. Or better: re-enqueue a scribe job for orphaned snapshots that are still fresh (<2 hours)
3. Add to the health endpoint: `orphanSnapshotCount` so the dashboard can surface it

### F5. 58 pinned nodes injecting 48k tokens — uncontrolled pinning

**What the docs say:** "Pinned nodes must be rare... do not pin one-off discoveries, transient tasks, or general background concepts"
**What actually happens:** 58 nodes are pinned. At ~830 tokens each, that's 48,189 tokens — more than MAP and PRIORS combined. The session-start hook loads all pinned nodes for the current project.

**Why it happened:** The librarian pins nodes conservatively in theory, but over many cycles, pins accumulate. Nothing un-pins nodes. The `maxPinnedTokens` config (5,000 tokens) exists in config but the session-start code in `session-start.ts:168` checks it per-node, not total. Even if it checked total, the librarian keeps pinning and nothing unpins.

**Solution:**
1. Fix `maxPinnedTokens` enforcement in session-start: sum all pinned node sizes and stop loading when budget is hit
2. Add a "pinned node audit" to the librarian: review all pinned nodes each cycle. If a pinned node hasn't been accessed in 30 days, unpin it
3. Add to the health endpoint: `pinnedTokenCount` and `pinnedNodeCount` with a warning if over budget
4. Consider reducing `maxPinnedTokens` from 5,000 to 3,000 — pinned content should be truly essential

### F6. Dreams churn at the cap — 20/20, rarely promote

**What the docs say:** "Dreams reaching confidence >= 0.5 after reinforcement across 3+ sessions" get promoted to real nodes.
**What actually happens:** 20/20 pending dreams, 41 integrated. The dreamer generates 2-3 dreams per cycle at 0.2-0.4 confidence. Reinforcement is weak — a dream only gets a confidence boost if new evidence directly references it, which rarely happens. Old dreams get archived to make room for new ones that also never promote.

**Why it happened:** The promotion threshold (0.5 across 3 sessions) is too high for the confidence range (0.2-0.4). The dreamer can't generate above 0.4 by design. Getting from 0.3 to 0.5 requires multiple explicit reinforcement events.

**Solution:**
1. Lower promotion threshold from 0.5 to 0.4 across 2+ sessions (not 3)
2. Add implicit reinforcement: when a node referenced by a dream gets a confidence boost or is recalled, boost the dream's confidence by 0.05
3. Reduce the hard cap from 20 to 15 pending dreams — less churn
4. Consider: allow the dreamer to promote a dream directly if it finds strong evidence in the current session's deltas

### F7. Skillforge has 1 manifest — it's barely running

**What the docs say:** "Skillforge is an automatic pipeline stage that converts frequently-accessed memory nodes into executable slash-command skills."
**What actually happens:** 10 skillforge jobs completed, 9 refreshes, but only 1 manifest on disk. The scoring threshold (0.65) may be too high, or the access-count-based scoring doesn't surface enough candidates.

**Why it happened:** The skillforge scoring depends on `access_count` and `recall_action_count` fields being updated, but these are only updated when `updateLastAccessed` is called — which happens inconsistently across different recall paths.

**Solution:**
1. Audit all recall/search/read_node paths to ensure they call `updateLastAccessed`
2. Consider lowering the score threshold from 0.65 to 0.55
3. Add `skillforgeCandidateCount` to the health endpoint — show how many nodes are near the threshold

### F8. The pipeline is reliable but expensive

**What the docs say:** "optionally runs a background scribe → auditor → librarian → dreamer pipeline"
**What actually happens:** The pipeline works — 726 jobs done, 7 failed. But each cycle is expensive:
- Scribe: reads snapshot + MAP + 2-5 nodes, writes delta (~2-5 min)
- Working updater: reads delta + traces, writes JSON (~2-3 min)
- Auditor: reads all deltas + preflight report + manifest, does mechanical fixes, writes audit (~5-8 min)
- Librarian: reads audit brief + PRIORS + MAP + SOMA + WORKING + node files, makes judgment calls, rebuilds context (~10-15 min)
- Dreamer: reads MAP + SOMA + key nodes, generates dreams (~3-5 min)

Total: ~25-35 minutes of LLM time per full cycle. At current token prices, each cycle costs $0.50-1.00.

**Why it matters:** The pipeline runs every time enough deltas accumulate (threshold: 3). With 8.8 deltas per session and multiple sessions per day, it can run 2-3 times daily. That's $1-3/day in pipeline costs alone, plus the $1-2/day in session injection costs.

**Solution:**
1. Incremental MAP regeneration — only rebuild sections affected by current deltas, not the entire 756-node MAP
2. Track per-job token costs and surface in the health endpoint
3. Raise the auditor scribe threshold from 3 to 5 deltas — run less frequently
4. Consider: combine auditor + librarian into a single pass (they currently run sequentially, both reading the same data)

---

## Implementation Roadmap

### Phase 1: Stop the Bleeding (Week 1)

| Item | Failure | Effort | Impact |
|------|---------|--------|--------|
| P1.1 Hard-cap PRIORS at 2,500 tokens in regeneration code | F1, F2 | Small | Saves ~26k tokens/session |
| P1.2 Total injection budget (15k tokens) in session-start | F1 | Medium | Prevents future bloat |
| P1.3 Fix pinned node budget enforcement (total, not per-node) | F1, F5 | Small | Saves ~45k tokens/session |
| P1.4 Clean up orphan snapshots in daemon tick | F4 | Small | Reclaims 2.4 MB, stops accumulation |
| P1.5 Add token accounting to health endpoint | F1 | Small | Makes the problem visible |

**Expected result:** Session injection drops from 93k → ~15k tokens. ~$0.02/session instead of ~$0.15.

### Phase 2: Quality Over Quantity (Week 2)

| Item | Failure | Effort | Impact |
|------|---------|--------|--------|
| P2.1 Default `decay_rate: 0.05` on all new nodes | F3 | Small | Prevents future noise |
| P2.2 Backfill `decay_rate` on existing nodes without it | F3 | Small | Unlocks decay on 400+ nodes |
| P2.3 Lower archive threshold to 0.2, add 14-day stale sweep | F3 | Medium | Archives ~200 low-value nodes |
| P2.4 Fix dream promotion threshold (0.4, 2 sessions) | F6 | Small | Dreams can actually promote |
| P2.5 PRIORS audit: librarian demotes project-specific entries to nodes | F2 | Medium | Compresses PRIORS to actual cognitive model |

**Expected result:** Graph shrinks from 756 → ~500 active nodes. PRIORS drops to actual 2,500 tokens. Dreams start promoting.

### Phase 3: Operational Improvements (Week 3)

| Item | Failure | Effort | Impact |
|------|---------|--------|--------|
| P3.1 Per-job token cost tracking | F8 | Medium | Users can see pipeline cost |
| P3.2 Pipeline reliability in health score | F8 | Small | Dashboard shows holistic health |
| P3.3 Incremental MAP regeneration | F8 | Large | Faster librarian cycles |
| P3.4 Raise auditor threshold from 3 to 5 deltas | F8 | Small | Fewer pipeline cycles/day |
| P3.5 Scribe extraction quality metric | F3 | Medium | Surfaces over-extraction |

**Expected result:** Pipeline cost drops ~30%. Health score reflects real system quality.

### Phase 4: Intelligence (Week 4+)

| Item | Failure | Effort | Impact |
|------|---------|--------|--------|
| P4.1 Context-aware PRIORS selection (project-relevant sections only) | F1, F2 | Large | Only loads what matters |
| P4.2 Cross-session deduplication in scribe | F3 | Medium | Prevents duplicate nodes |
| P4.3 Memory dashboard as first-class surface | — | Medium | Users can actually see their graph |
| P4.4 Implicit dream reinforcement on node access | F6 | Medium | Dreams earn confidence naturally |
| P4.5 Audit all recall paths for access tracking | F7 | Small | Skillforge scoring works properly |
| P4.6 Combine auditor + librarian into single pass | F8 | Large | Halves pipeline LLM cost |

**Expected result:** The system is genuinely intelligent — it loads what matters, extracts what's durable, and costs a fraction of what it does today.

---

## Success Metrics

| Metric | Current | Target (Phase 1) | Target (Phase 4) |
|--------|---------|-------------------|-------------------|
| Session injection | 93k tokens | 15k tokens | 8k tokens |
| PRIORS size | 28,795 tokens | 2,500 tokens | 1,500 tokens |
| Active nodes | 756 | 500 | 350 |
| Nodes < 0.4 confidence | 387 (51%) | 100 (20%) | 50 (14%) |
| Pinned token cost | 48,189 | 5,000 | 3,000 |
| Orphan snapshots | 192 | 0 | 0 |
| Pipeline cost/session | ~$1.50 | ~$0.50 | ~$0.25 |
| Dream promotion rate | Near zero | 2-3/month | 5+/month |
| Skillforge manifests | 1 | 5-10 | 15-20 |
