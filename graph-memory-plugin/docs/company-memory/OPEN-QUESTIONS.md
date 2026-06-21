# Company Memory — Open Questions Deep Dives

> Each question from DESIGN.md expanded with options, tradeoffs, and working recommendations.

## 1. Contribution Review Workflow

### The Spectrum

```
Full auto ◄──────────────────────────────────► Full manual
(trust everyone)                              (review everything)
```

### Options

**A. Auto-merge with threshold**
- Contributor assigns confidence. Above threshold → auto-merge. Below → queue for review.
- Pro: Fast knowledge propagation. Con: Bad knowledge propagates too.
- Threshold needs to be per-category: decisions (high bar) > facts (low bar).

**B. Always-review with domain stewards**
- Every contribution goes to a review queue. Domain steward (existing concept) approves.
- Pro: Quality control. Con: Bottleneck, especially for small teams.
- Maps to existing steward system — just extend steward scope to company-level.

**C. Graduated trust**
- New contributors require review for first N contributions.
- After N accepted contributions, auto-promote with threshold.
- Pro: Scales with trust. Con: Gaming risk (N low-quality contributions to unlock auto).

**D. Democratic merge**
- If K team members independently contribute similar knowledge, auto-merge.
- Pro: Wisdom of crowds. Con: Popular ≠ correct. Slow (needs multiple contributions).

### Working Recommendation

**Hybrid: Category-gated auto-merge + steward review for sensitive categories.**

```yaml
contribution_policy:
  auto_merge:
    categories: [facts, patterns, architecture]
    min_confidence: 0.85
    max_pending_age: 24h  # auto-merge if no objection in 24h
  review_required:
    categories: [decisions, procedures, anti-patterns]
    reviewers: domain stewards for the node's category
  always_review:
    categories: [guardrails, company-model-changes]
    reviewers: [company-admin]
```

---

## 2. Conflict Resolution

### Types of Conflict

1. **Direct contradiction**: Node A says "use X", Node B says "never use X"
2. **Scope overlap**: Node A covers the same topic as Node B with different emphasis
3. **Temporal drift**: Node A from 6 months ago contradicts Node B from today
4. **Perspective divergence**: Two people genuinely see the same thing differently

### Resolution Strategies

**A. Confidence-weighted merge**
- Higher confidence wins. Loser archived with note.
- Pro: Deterministic. Con: Confidence is subjective.

**B. Contradiction flag + human review**
- Librarian detects contradiction, creates a `contradictions/` node, blocks auto-merge.
- Pro: Safe. Con: Can accumulate unresolved contradictions.

**C. Temporal resolution**
- Newer knowledge wins by default. Old node archived with timestamp note.
- Pro: Simple, reflects reality (decisions change). Con: Recency bias.

**D. Scope narrowing**
- Both nodes kept, but scope narrowed: "for service X, use A; for service Y, use B"
- Pro: Preserves nuance. Con: Requires sophisticated merge prompt.

### Working Recommendation

**Layered: Temporal default + contradiction detection + human escalation.**

1. Librarian compares timestamps. Newer wins provisionally.
2. If both were created in the same week → contradiction flag.
3. Contradictions block auto-merge, notify domain steward.
4. Steward resolves: merge, keep both with scope, or pick one.

---

## 3. Team Membership Resolution

### Options

**A. Explicit config**
```yaml
# ~/.graph-memory/company/config.yml
team: platform
projects:
  ConnorCallahan01/cogni-code: platform
  ConnorCallahan01/oliver: platform
  ConnorCallahan01/openpatient: product
```
- Pro: Explicit, no surprises. Con: Manual maintenance.

**B. Auto-detected from project**
- Company graph has `project-teams.yml` mapping repos to teams.
- Individual's `detectProject()` already knows the active repo.
- Lookup: repo → team → inject team whisper.
- Pro: Zero config. Con: What if project spans teams?

**C. Git branch-based**
- Individual works on `team/platform` branch of company repo.
- Whisper comes from the branch's team model.
- Pro: Natural git workflow. Con: Branch switching is awkward for multi-team work.

**D. Multiple team membership**
- Individual belongs to N teams. All team whispers injected.
- Ordered by: current project match > recency of contribution > team size.
- Pro: Flexible. Con: Token budget (N × 200 tokens).

### Working Recommendation

**Auto-detection with explicit override.**

1. Company graph has `project-teams.yml` mapping repos → teams.
2. `detectProject()` already runs → lookup team → inject that team's whisper.
3. If lookup fails or user wants override → `config.yml` takes precedence.
4. Multi-team users get up to 2 team whispers (400 tokens max).

---

## 4. Whisper Generation Timing

### Options

**A. On every company librarian run**
- Whisper always fresh. Con: Expensive LLM call every tick.

**B. On mental model change only**
- Whisper updates when model.json changes. Con: Node-level changes might warrant whisper update.

**C. On contribution merge**
- Whisper updates when new knowledge is integrated. Con: What if nodes decay or are archived?

**D. Hash-based trigger**
- Hash all inputs to whisper generation (model.json + relevant nodes). If hash changes → regen.
- Pro: Only regenerates when actually needed. Con: Hash computation overhead.

### Working Recommendation

**Hash-based trigger.**

```typescript
function shouldRegenerateWhisper(scope: 'company' | 'team'): boolean {
  const inputs = collectWhisperInputs(scope) // model.json + category nodes
  const hash = hashInputs(inputs)
  const cached = readCachedHash(scope)
  return hash !== cached
}
```

Company daemon checks hash on every tick. Only calls LLM for whisper generation when hash actually changed. Near-zero overhead when nothing changed.

---

## 5. Individual-to-Company Node Deduplication

### Options

**A. Keep both**
- Personal node stays. Company node exists independently.
- Pro: Safe, no data loss. Con: Ambient recall surfaces both, wastes tokens.

**B. Replace personal with reference**
- Personal node becomes: `ref: company/architecture/use-e2b`
- Pro: Saves tokens, single source of truth. Con: Dependency on company graph being available.

**C. Archive personal**
- Personal node archived. Company node takes over.
- Pro: Clean. Con: Loses personal context (why I discovered this, what I was doing).

**D. Shadow mode**
- Personal node kept but deprioritized in recall scoring.
- Pro: Both available, company node preferred. Con: Still some redundancy.

### Working Recommendation

**Shadow mode.**

- Promoted node gets `company_ref: path/to/company/node` field in frontmatter.
- Ambient recall: if personal node has `company_ref`, boost the company node and deprioritize the personal one.
- Personal node retains original context (discovery story, soma) but doesn't surface in recall.
- Best of both worlds: personal memory preserved, company knowledge preferred.

---

## 6. Onboarding Bootstrap

### Options

**A. Manual git clone + config**
- `git clone <company-repo> ~/.graph-memory/company/`
- Edit `config.yml` with team assignment
- Pro: Simple. Con: Multiple manual steps.

**B. One-command join**
- `graph_memory(action="company_join", repo: "<url>", team: "platform")`
- Plugin handles: clone, config, initial whisper cache, skill sync
- Pro: One step. Con: Need to build the command.

**C. Auto-discovery**
- Company repo URL in environment variable or global config
- Plugin auto-clones on first session start
- Pro: Zero-config for employee. Con: Needs pre-existing infra.

### Working Recommendation

**One-command join with auto-discovery fallback.**

```bash
# Explicit join
graph_memory(action="company_join", repo="git@github.com:company/knowledge.git", team="platform")

# Or auto-discovery via env
GRAPH_MEMORY_COMPANY_REPO=git@github.com:company/knowledge.git
GRAPH_MEMORY_TEAM=platform
```

First session start after join: clone repo, cache whispers, discover skills, inject company context immediately.

---

## 7. Skillforge for Company Skills

### Key Difference from Personal Skills

Personal Skillforge generates skills from individual patterns. Company Skillforge generates skills from **collective procedures** — things the company has decided are standard practice.

### Options

**A. Same Skillforge, different input**
- Reuse existing Skillforge pipeline. Point at company nodes instead of personal nodes.
- Pro: No new code. Con: Prompts may not be tuned for organizational procedures.

**B. Dedicated company Skillforge with procedure-oriented prompts**
- New prompt template: "Given these company decisions and procedures, generate an executable skill..."
- Pro: Better output quality. Con: More code to maintain.

**C. Human-authored skills only**
- Skills are hand-written and committed to company repo.
- Skillforge suggests skill opportunities but doesn't auto-generate.
- Pro: High quality. Con: Doesn't scale, manual effort.

### Working Recommendation

**Tiered: Auto-generated drafts + human curation.**

1. Company Skillforge runs on company nodes, generates draft skills to `skills/.drafts/`.
2. Domain steward reviews and promotes to `skills/{name}/SKILL.md`.
3. Humans can also write skills directly (no Skillforge involvement).
4. Skills get a `provenance` field: `auto-generated` vs. `human-authored`.

---

## 8. Multi-Company Support

### Scenarios

- Contractor working across multiple clients
- Acquisition (two company graphs need to merge)
- Open-source community graph + employer graph

### Options

**A. Multiple clones**
- `~/.graph-memory/company-acme/`, `~/.graph-memory/company-globex/`
- Independent sync cycles
- Pro: Clean separation. Con: Token budget × N companies.

**B. One company at a time, switchable**
- `~/.graph-memory/company/` is a single clone
- Switch company via config change
- Pro: Simple. Con: No concurrent access, switching friction.

**C. Priority stacking**
- Multiple companies inherited simultaneously
- Primary company gets higher ambient recall boost
- Pro: Flexible. Con: Complex scoring, token budget pressure.

### Working Recommendation

**Defer to Phase 6. Start with single-company support.**

The multi-company case introduces significant complexity (cross-company knowledge conflicts, token budget multiplication, auth complexity). Ship single-company first, learn from real usage, then extend.

---

## 9. Ambient Recall Budget

### The Problem

Ambient recall already runs on every user message. Adding a company index doubles (or more) the search space. Need to control token overhead.

### Strategies

**A. Hard cap on company results**
- Max 2-3 company nodes per ambient recall invocation
- Personal nodes always take priority
- Pro: Predictable token cost. Con: Might miss relevant company knowledge.

**B. Higher threshold for company nodes**
- Company nodes need score > 0.7 to surface (vs. 0.5 for personal)
- Pro: Only high-relevance company knowledge injected. Con: Might be too restrictive.

**C. Category gating**
- Only certain company categories are searched via ambient recall
- Good candidates: decisions, patterns, architecture, procedures
- Excluded: people, meta, audits, incidents (too noisy, too specific)
- Pro: Reduces search space meaningfully. Con: Might miss unexpected cross-domain connections.

**D. Recency + confidence gating**
- Only company nodes with confidence > 0.7 AND updated in last 30 days are searched
- Pro: Fresh, confident knowledge only. Con: Misses durable old knowledge.

### Working Recommendation

**Combined: Category gating + result cap + confidence threshold.**

```yaml
company_ambient_recall:
  categories: [decisions, patterns, architecture, procedures, anti-patterns]
  max_results: 3
  min_confidence: 0.7
  score_threshold: 0.6  # higher than personal (0.5)
  boost: 0.8            # slightly lower than personal (1.0)
```

---

## 10. Offline Operation

### Scenarios

- Airplane / no internet
- Company git repo down
- VPN required but not connected

### Requirements

1. Personal graph works fully offline (already true)
2. Cached company whispers remain valid (stale but functional)
3. Contributions queue locally and sync when connected
4. No errors or degraded experience from company sync failure

### Working Recommendation

**Graceful degradation with queued writes.**

```
Online:  Full company sync (pull whispers, push contributions, ambient recall)
Degraded: Cached whispers (stale), no ambient recall of new company nodes, contributions queued locally
Offline:  Personal graph only. No company features. Contributions queued.
```

Sync daemon tries git pull/push on every tick. On failure: log warning, continue with cached state. On success: update cache, flush contribution queue.

No hard dependency on company repo for any personal functionality.
