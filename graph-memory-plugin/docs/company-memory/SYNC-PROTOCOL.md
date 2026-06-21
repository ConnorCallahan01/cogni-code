# Sync Protocol — Git-Based Company Graph Synchronization

> How individual graphs stay in sync with the company knowledge graph.

## Protocol Overview

```
┌─────────────────────────────────────────────────────────┐
│                    INDIVIDUAL DAEMON                      │
│                                                          │
│  Every tick (30s):                                       │
│  1. git pull --rebase (company repo)                    │
│  2. Diff incoming changes against cached state           │
│  3. If whispers changed → update inherited/ cache        │
│  4. If index changed → rebuild local company index       │
│  5. If skills changed → discover new company skills      │
│  6. Flush local contribution queue (git push)            │
│                                                          │
│  On node creation (librarian → contributor):             │
│  1. Evaluate for promotion                               │
│  2. If promotable → write to contributions/pending/      │
│  3. git add + commit + push                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    COMPANY DAEMON                         │
│                                                          │
│  Every tick (configurable, default 5min):                │
│  1. git pull (collect individual contributions)          │
│  2. Process contributions (auto-merge or queue review)   │
│  3. Company librarian (process company-level deltas)     │
│  4. Regenerate whispers (hash-based trigger)             │
│  5. Company Skillforge (generate/update skills)          │
│  6. Update company index                                 │
│  7. git add + commit + push                              │
│  8. Sync to Notion (if configured)                       │
└─────────────────────────────────────────────────────────┘
```

## Git Repository Structure

### Branch Strategy

```
main                    # Stable company knowledge
├── contributions       # Incoming contributions from individuals
├── team/platform       # Platform team scoped changes
├── team/product        # Product team scoped changes
└── review/{id}         # Individual review branches for sensitive contributions
```

### Branch Protection

```yaml
# GitHub branch protection (or equivalent)
main:
  required_reviews: 1  # Company steward must approve
  allow_force_push: false
  required_checks: [company-index-valid, whisper-hash-check]

contributions:
  required_reviews: 0  # Individuals can push freely
  allow_force_push: false

team/*:
  required_reviews: 1  # Team lead approves
  required_reviewers: [team-lead-username]
```

## Sync Operations

### Pull (Individual → Update Local Cache)

```typescript
interface SyncPullResult {
  whispers_updated: boolean;
  index_updated: boolean;
  skills_updated: boolean;
  new_nodes: string[];
  updated_nodes: string[];
  conflicts: SyncConflict[];
}

async function syncPull(): Promise<SyncPullResult> {
  const companyDir = path.join(CONFIG.graphRoot, 'company')
  
  // 1. Pull latest
  const pullResult = await gitPull(companyDir, { rebase: true })
  if (!pullResult.success) {
    log.warn('Company sync pull failed', { error: pullResult.error })
    return { whispers_updated: false, index_updated: false, skills_updated: false, new_nodes: [], updated_nodes: [], conflicts: [] }
  }

  // 2. Diff against cached state
  const prevState = readCachedState()
  const currentState = readRepoState(companyDir)

  const result: SyncPullResult = {
    whispers_updated: prevState.companyWhisperHash !== currentState.companyWhisperHash,
    index_updated: prevState.indexHash !== currentState.indexHash,
    skills_updated: prevState.skillsHash !== currentState.skillsHash,
    new_nodes: diffNewNodes(prevState.index, currentState.index),
    updated_nodes: diffUpdatedNodes(prevState.index, currentState.index),
    conflicts: [],
  }

  // 3. Update cache
  if (result.whispers_updated) {
    cacheWhispers(companyDir)
  }
  if (result.index_updated) {
    rebuildCompanyIndex(companyDir)
  }
  if (result.skills_updated) {
    discoverCompanySkills(companyDir)
  }

  // 4. Update cached state
  writeCachedState(currentState)

  return result
}
```

### Push (Individual → Submit Contributions)

```typescript
interface SyncPushResult {
  pushed: boolean;
  contributions_submitted: number;
  error?: string;
}

async function syncPush(): Promise<SyncPushResult> {
  const companyDir = path.join(CONFIG.graphRoot, 'company')
  const contributionsDir = path.join(CONFIG.graphRoot, 'contributions', 'pending')

  // 1. Check for pending contributions
  const contributions = fs.readdirSync(contributionsDir)
  if (contributions.length === 0) {
    return { pushed: true, contributions_submitted: 0 }
  }

  // 2. Copy contributions to company repo
  for (const file of contributions) {
    const src = path.join(contributionsDir, file)
    const dest = path.join(companyDir, 'contributions', 'pending', `${CONFIG.userId}-${file}`)
    fs.copyFileSync(src, dest)
  }

  // 3. Commit and push
  await gitAdd(companyDir, 'contributions/')
  await gitCommit(companyDir, `contributions: ${contributions.length} pending from ${CONFIG.userId}`)
  const pushResult = await gitPush(companyDir)

  if (!pushResult.success) {
    // Pull + rebase + retry
    await gitPull(companyDir, { rebase: true })
    const retryResult = await gitPush(companyDir)
    if (!retryResult.success) {
      return { pushed: false, contributions_submitted: 0, error: retryResult.error }
    }
  }

  // 4. Clear local contributions queue
  for (const file of contributions) {
    fs.unlinkSync(path.join(contributionsDir, file))
  }

  return { pushed: true, contributions_submitted: contributions.length }
}
```

## Conflict Handling

### Merge Conflicts

Git rebase can produce conflicts when two individuals contribute to the same area.

```
Individual A: adds contributions/pending/new-pattern.md
Individual B: adds contributions/pending/new-pattern.md (same filename)
```

Resolution strategies:

1. **Namespace contributions with user ID**: `{userId}-{filename}.md` — prevents filename collisions.
2. **Auto-resolve**: Contributions are additive (new files), so conflicts are rare.
3. **Manual escalation**: If rebase fails after 2 retries, log error and queue for next tick.

### Content Conflicts (Semantic)

Two people contribute knowledge that contradicts. Not a git conflict — a semantic conflict.

Handled by the company daemon's conflict detection (see PROMOTION-PIPELINE.md).

## Sync Timing

### Individual Daemon

```yaml
company_sync:
  pull_interval: 30s        # How often to pull from company repo
  push_interval: immediate  # Push contributions as soon as created
  retry_on_failure: true
  retry_backoff: 5min       # Exponential backoff on repeated failures
  max_retry: 3
```

### Company Daemon

```yaml
company_daemon:
  tick_interval: 5min       # Process contributions every 5 minutes
  whisper_check: always     # Check whisper hash on every tick
  skillforge_interval: 1h   # Generate skills hourly
  index_rebuild: on_change  # Rebuild index only when nodes change
  notion_sync: daily        # Sync to Notion once per day
```

## Offline Graceful Degradation

```typescript
enum SyncState {
  Online,       // Full sync: pull + push + ambient recall
  Degraded,     // Cached whispers, no push, limited ambient recall
  Offline,      // Personal graph only, contributions queued locally
}

function getSyncState(): SyncState {
  const lastSuccessfulSync = readLastSuccessfulSync()
  const timeSinceSync = Date.now() - lastSuccessfulSync
  
  if (timeSinceSync < 5 * 60 * 1000) return SyncState.Online
  if (timeSinceSync < 24 * 60 * 60 * 1000) return SyncState.Degraded
  return SyncState.Offline
}
```

### Behavior by State

| Feature | Online | Degraded | Offline |
|---------|--------|----------|---------|
| Company whisper injection | Fresh | Cached (stale) | Cached (stale) |
| Team whisper injection | Fresh | Cached (stale) | Cached (stale) |
| Company ambient recall | Full | Cached index only | Disabled |
| Contribution submission | Immediate | Queued locally | Queued locally |
| Company skills | Latest | Cached | Cached |
| Personal graph | Full | Full | Full |

## Authentication

Git-based auth uses standard SSH keys or HTTPS tokens:

```yaml
# ~/.graph-memory/company/config.yml
repo: git@github.com:company/knowledge.git
auth:
  method: ssh  # ssh | https
  # SSH: uses ~/.ssh/id_rsa (or configured key)
  # HTTPS: uses git credential helper or token
team: platform
```

No custom auth system needed — leverage existing git authentication infrastructure.

## Initial Clone

First-time setup when joining a company:

```typescript
async function companyJoin(repoUrl: string, team: string): Promise<void> {
  const companyDir = path.join(CONFIG.graphRoot, 'company')
  
  // 1. Clone company repo
  await gitClone(repoUrl, companyDir)

  // 2. Write local config
  writeCompanyConfig({ repo: repoUrl, team })

  // 3. Initial cache build
  cacheWhispers(companyDir)
  rebuildCompanyIndex(companyDir)
  discoverCompanySkills(companyDir)

  // 4. Verify
  const whisper = readCompanyWhisper()
  if (!whisper) {
    throw new Error('Company whisper not found. Repo may not be a valid company graph.')
  }

  log.info('Joined company graph', { repo: repoUrl, team, whisper_length: whisper.length })
}
```
