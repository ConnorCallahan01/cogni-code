# Promotion Pipeline — CONTRIBUTOR Stage Design

> How individual knowledge becomes company knowledge.

## Pipeline Position

```
Existing: scribe → auditor → librarian → dreamer
New:      scribe → auditor → librarian → CONTRIBUTOR → dreamer
```

Contributor runs after librarian (so it evaluates the final node state) and before dreamer (so company-level patterns can seed dreams).

## CONTRIBUTOR Prompt Design

### Input

The contributor receives:
1. The new/updated node (after librarian processing)
2. The company mental model (from cached company whisper)
3. The existing company index (to check for duplicates)
4. The node's category and project context

### Evaluation Criteria

```
For each node, evaluate:

1. SCOPE: Is this knowledge useful beyond one person?
   - Personal (cognitive style, soma, preferences) → NO
   - Project-specific but team-useful (architecture, patterns) → MAYBE
   - Cross-project (decisions, procedures, anti-patterns) → YES
   - Company-wide (guardrails, principles, domain knowledge) → YES

2. NOVELTY: Does the company already know this?
   - Exact match in company index → NO (skip)
   - Partial overlap with existing company node → MAYBE (propose merge)
   - Completely new knowledge → YES

3. QUALITY: Is this well-formed and confident?
   - Low confidence (< 0.5) → NO (too uncertain to share)
   - Medium confidence (0.5-0.85) → MAYBE (queue for review)
   - High confidence (> 0.85) → YES (candidate for auto-merge)

4. CATEGORY FIT: Does this belong in a shared category?
   - Personal categories (soma, preferences, cognitive) → NO
   - Shareable categories (decisions, architecture, patterns, procedures, anti-patterns) → YES
```

### Output Format

```yaml
contribution:
  source_node: "architecture/some-discovery"
  action: promote | merge | skip
  target_path: "architecture/some-discovery"  # in company graph
  confidence: 0.9
  reason: "Cross-project architecture decision that company doesn't have yet"
  
  # If action is merge:
  merge_target: "architecture/existing-related-node"
  merge_strategy: "append" | "replace" | "narrow_scope"
  
  # If action is skip:
  skip_reason: "Personal preference, not broadly applicable"
```

### Decision Matrix

| Scope | Novel | Confidence | Category Fit | Action |
|-------|-------|------------|--------------|--------|
| YES | YES | HIGH | YES | Auto-promote |
| YES | YES | MED | YES | Queue for review |
| YES | YES | LOW | YES | Skip (too uncertain) |
| YES | NO | HIGH | YES | Queue for merge |
| MAYBE | YES | HIGH | YES | Queue for review |
| MAYBE | YES | MED | YES | Queue for review |
| NO | - | - | - | Skip |

## Contribution File Format

When a node is proposed for promotion, a contribution file is created:

```markdown
---
id: contributions/pending/2026-05-29-architecture-use-e2b
source: "individual:patrick"
source_node: "architecture/use-e2b-sandbox"
target_path: "architecture/use-e2b-sandbox"
status: pending  # pending | auto_merged | reviewed | rejected
submitted: 2026-05-29T10:00:00Z
confidence: 0.9
reviewer: null
reviewed_at: null
---

# Contribution: Use E2B for Sandboxes

## Source
Individual node: `architecture/use-e2b-sandbox` (Patrick)

## Proposed Content
[Full node content]

## Contributor Assessment
Cross-project architecture decision. Company has no existing sandbox strategy. High confidence from production validation.

## Duplicate Check
No matches in company index.
```

## Auto-Merge Rules

```yaml
auto_merge:
  enabled: true
  rules:
    - condition: confidence >= 0.85 AND no_duplicates AND category IN [facts, patterns, architecture]
      action: auto_merge
      
    - condition: confidence >= 0.85 AND duplicate_found AND merge_strategy = "append"
      action: auto_merge  # append new content to existing node
      
    - condition: category IN [decisions, procedures, guardrails]
      action: always_review  # never auto-merge sensitive categories
      
    - condition: confidence < 0.5
      action: skip  # never propose low-confidence contributions
```

## Review Workflow

For contributions that require human review:

1. Contribution written to `contributions/pending/`
2. Company daemon picks up pending contributions
3. Notifies domain steward (based on node category)
4. Steward options:
   - **Accept**: Merge into company graph
   - **Reject**: Archive with reason
   - **Edit**: Modify content, then merge
   - **Defer**: Leave pending (expires after 30 days)

### Notification Options

- **Slack/Teams integration**: "New contribution awaiting review: [link]"
- **Notion integration**: Contribution appears as review task in Notion
- **Email digest**: Daily summary of pending contributions
- **CLI command**: `graph_memory(action="review_contributions")`
- **Dashboard**: Memory dashboard shows pending contributions

## Conflict Detection

Before merge, check for conflicts:

1. **Exact duplicate**: Same gist, same content → skip contribution
2. **Overlapping scope**: Similar topic, different conclusions → flag as conflict
3. **Contradiction**: Directly opposes existing company knowledge → block, escalate
4. **Superset**: Contribution covers broader scope than existing → propose replacement

```typescript
function detectConflict(contribution: Node, companyIndex: Index): ConflictType {
  const matches = searchIndex(companyIndex, contribution.gist, contribution.keywords)
  
  if (matches.length === 0) return 'none'
  
  const topMatch = matches[0]
  const similarity = computeSimilarity(contribution, topMatch)
  
  if (similarity > 0.9) return 'duplicate'
  if (similarity > 0.7 && isContradictory(contribution, topMatch)) return 'contradiction'
  if (similarity > 0.5) return 'overlap'
  return 'none'
}
```

## Promotion Frequency

How often should the contributor run?

- **Every librarian cycle**: Most responsive, but contributor runs even when no promotions are likely.
- **On node creation/update only**: Contributor only evaluates new/changed nodes. Efficient.
- **Batch mode**: Accumulate candidate nodes, evaluate in batch once per day. Cheaper LLM calls.

### Recommendation

**On node creation/update only.** The contributor is a lightweight check after each librarian run. Most evaluations will be "skip" (personal knowledge). Only occasionally will a node warrant promotion. The per-node cost is minimal compared to a full batch evaluation.

## Privacy Safeguards

The contributor must never promote:
- Soma markers (emotional data)
- Individual preferences (cognitive style, UI preferences)
- Working memory (session-specific context)
- Session logs
- Personal mental model data
- Any node with `personal: true` frontmatter field (explicit opt-out)

```yaml
# Individual node with privacy opt-out
id: patterns/my-debugging-approach
personal: true  # Never promoted to company graph
```
