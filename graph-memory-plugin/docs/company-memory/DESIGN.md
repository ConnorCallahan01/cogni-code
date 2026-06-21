# Company Memory — Design Document

> Status: Active research. Three-tier knowledge graph architecture for multi-user organizational memory.

## Problem Statement

Graph-memory is a single-user plugin. A company wants to capture and share institutional knowledge — how they work, how they think, what they've decided — across every engineer. We need to turn per-user memory into a hierarchical system that preserves individual privacy while enabling organizational knowledge transfer.

## Core Insight: Declared vs. Emergent Knowledge

Individual mental models are **emergent** — the system observes a person over time and discovers preferences, patterns, and cognitive style.

Company mental models must be **declared** — the CEO or top executive states the company's personality: values, principles, tech direction, guardrails. This is not something you discover from watching engineers. It's something leadership states, and the system uses it as a filter.

This creates a productive tension:

- **Top-down**: CEO declares personality → injected into every session → filters what gets promoted
- **Bottom-up**: Engineers discover patterns, make decisions → promoted against declared personality → misalignment surfaces as a health signal

The CONTRIBUTOR stage doesn't ask "is this broadly useful?" in a vacuum. It asks: **"Does this align with our declared principles?"** If yes, promote. If it contradicts them, flag for review — either the knowledge is wrong, or the company personality needs updating.

## Decision Provenance

Every promoted node carries a provenance chain — not just "what was decided" but **who decided it, why, and how it's been treated since**:

```
Decision: "We use Neon for all new services"
  Origin: Patrick (senior engineer, platform team)
  Context: Evaluated after Supabase connection pooling issues in prod
  Approved by: CTO
  Date: 2026-03-15
  Still active: yes
  Challenged: never
```

vs.

```
Pattern: "Always validate on the wire before declaring done"
  Origin: Patrick (discovered from 6 incidents across 3 projects)
  Adopted by: platform team (4 engineers follow this)
  Not yet company-wide: true
  Status: emerging norm, not yet declared principle
```

The first is a **decided thing with authority**. The second is an **emerging pattern with adoption but no formal declaration**. Both are valuable, but they carry different weight.

Provenance matters because:
1. A junior engineer questioning "we use Neon" gets the full context — who decided, why, what happened before
2. The system can surface when a pattern has been adopted by the team but not yet declared by leadership (candidate for promotion to principle)
3. Decision authority is trackable — who actually makes decisions vs. who the org chart says should

## Observed Authority Graph

The org chart declares who *should* have authority. The system observes who *actually* has authority by tracking decision provenance over time. When these diverge, that's a health signal:

> "Your org chart says Sarah leads infra, but 80% of infrastructure decisions in the graph came from Marcus."

This isn't a problem to fix — it's an insight. The CEO might want to know that the formal structure and the actual decision-making structure are different. The system learns from interactions, not just declarations.

## Onboarding — Tiered, Not Dumped

New hires don't get everything at once. Knowledge surfaces progressively:

1. **First week**: Company personality + anti-patterns. Just the culture — who we are, what we don't do.
2. **Second week**: Relevant knowledge starts surfacing as they work. Ambient discovery of decisions and patterns related to what they're actually doing.
3. **Ongoing**: Full access to company knowledge, but surfaced contextually through ambient recall.

## CEO UX — Conversation, Not Forms

The CEO doesn't fill out a JSON schema. They have a conversation with the agent:

> "Tell me about your company. What do you build? What do you value? What are your dealbreakers?"

The system produces the company mental model from that conversation. CEO reviews, tweaks, approves. Updates are the same — a conversation, not a form edit.

### Stable vs. Living Split

The CEO's declaration has two layers:
1. **Stable (identity)** — values, principles, guardrails. Changes rarely. Hard to change intentionally.
2. **Living (structure)** — current priorities, team structure, active projects. Changes often. Auto-detected from org chart and project activity.

CEO sets identity once. System keeps structure current. CEO intervenes only when divergence surfaces.

## Architecture Overview

Three-tier inheritance with whisper-compressed injection:

```
Company (shared git repo — declared by leadership)
  └── Team (scoped subgraphs — org chart provided at onboarding)
       └── Individual (current ~/.graph-memory/, unchanged, fully private)
```

Knowledge flows **up** via promotion (contribution pipeline, evaluated against declared personality) and **down** via inheritance (pre-computed whispers + ambient recall).

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hierarchy model | Three-tier (Company → Team → Individual) | Matches how companies actually think. Teams have their own conventions. |
| Storage | Git repo for shared graph | Fits filesystem-is-the-database philosophy. Free history, conflict resolution, access control. |
| Privacy | Full individual privacy | Only explicit contributions get promoted. Company can't read personal nodes, soma, preferences. |
| Injection | Whisper-compressed (~200 tokens each) | Token budget is the constraint. Pre-compute at source, read at session start. |
| On-demand recall | Ambient recall searches company index | Company MAP is never injected at session start. Surfaces only when relevant to current query. |
| Skills | Shared skill library via Skillforge | Company-wide procedures become executable agent skills available to all employees. |

## Storage Layout

### Company Git Repo (shared)

```
company-graph/
├── mind/
│   ├── model.json              # Company culture, principles, guardrails
│   └── whisper.txt             # Pre-compressed (~200 tokens)
├── teams/
│   ├── platform/
│   │   ├── model.json          # Team conventions, tech stack, active work
│   │   └── whisper.txt         # Pre-compressed (~200 tokens)
│   └── product/
│       ├── model.json
│       └── whisper.txt
├── nodes/                      # Shared knowledge (identical format to personal)
│   ├── decisions/
│   ├── architecture/
│   ├── patterns/
│   ├── anti-patterns/
│   ├── procedures/
│   └── people/
├── skills/                     # Company-wide Skillforge output
│   ├── deploy-to-production/
│   │   └── SKILL.md
│   └── incident-response/
│       └── SKILL.md
├── contributions/
│   └── pending/                # Proposed additions from individuals
└── .index.json                 # Company knowledge index for ambient recall
```

### Individual Graph (unchanged, plus new additions)

```
~/.graph-memory/
├── [everything that exists today — untouched]
├── company/                    # git clone of company graph
├── inherited/                  # Cached at sync time, read at session start
│   ├── company-whisper.txt
│   ├── team-whisper.txt
│   ├── company-anti-patterns.md
│   └── company-pinned/
└── contributions/              # Proposed promotions
    └── pending/
```

## Session-Start Injection (Revised)

```
Current layers (unchanged):
  Personal mental model (model.json)          ~400 tokens
  Personal anti-patterns                      ~100 tokens
  Project lens                                ~300 tokens
  Last session log                            ~150 tokens

NEW layers (pre-computed, zero runtime cost):
  Company whisper                             ~200 tokens
  Team whisper                                ~200 tokens
  Company anti-patterns (merged)              ~100 tokens
  Company pinned nodes (max 3-5)              ~300 tokens

Existing layers (unchanged):
  Personal MAP                                ~3,000 tokens
  DREAMS / WORKING / PINNED                   ~2,000 tokens

TOTAL: ~6,750 tokens (within 15K budget)
NEW OVERHEAD: ~800 tokens (5% increase)
```

## Promotion Pipeline

New CONTRIBUTOR stage after librarian:

```
scribe → auditor → librarian → CONTRIBUTOR
```

The contributor evaluates each new/updated node:
- Does this match a shared category? (decisions, architecture, patterns, procedures)
- Is it broadly useful beyond this person?
- Does the company not already know this?

Outcomes:
- **High confidence (>0.85), no duplicate** → auto-promoted to company repo
- **Medium confidence, possible value** → writes to `contributions/pending/` for review
- **Personal only** → stays in individual graph (soma, preferences, cognitive style)

Company daemon processes contributions:
- Auto-merges high-confidence items
- Regenerates whispers when mental model changes
- Runs Skillforge on company nodes for shared skills
- Commits + pushes

## Sync Flow

```
Individual daemon (per user)              Company daemon (shared repo)
┌───────────────────────┐                ┌───────────────────────┐
│ Every tick:           │                │ Every tick:           │
│ 1. git pull --rebase  │                │ 1. Process            │
│ 2. Cache whispers →   │                │    contributions      │
│    inherited/          │                │ 2. Company librarian  │
│ 3. Rebuild company    │                │ 3. Regenerate         │
│    index for ambient  │                │    whispers           │
│    recall             │                │ 4. Skillforge on      │
│                       │                │    company nodes      │
│ On node creation:     │                │ 5. git commit + push  │
│ 1. Evaluate for promo │                └───────────┬───────────┘
│ 2. Write to           │                            │
│    contributions/     │◄──── git push/pull ────────┘
│ 3. git push           │
└───────────────────────┘
```

## Shared Skills

Company maintains a skills library. Skillforge runs on company nodes and generates executable agent skills:

```
company-graph/skills/
├── deploy-to-production/SKILL.md      # "How we ship to Railway"
├── incident-response/SKILL.md         # "Our incident procedure"
├── code-review/SKILL.md               # "Our review standards"
├── database-migration/SKILL.md        # "How we handle schema changes"
└── on-call-handoff/SKILL.md           # "Shift handoff procedure"
```

Individual plugin discovers skills from both:
- `~/.agents/skills/` (personal, current behavior)
- `~/.graph-memory/company/skills/` (inherited, new)

Company skills namespaced `[company]` in the harness. New hires get the full institutional skill library on day 1.

## Access Control

Git-native:
- **Company repo**: all employees get read access
- **Team branches**: team members get write via CODEOWNERS
- **Contributions**: individuals push to `contributions/` prefix, company librarian merges
- **Sensitive nodes**: can be git-crypted or excluded per-team

Individual graphs are fully private — git only syncs the `company/` subdirectory.

## Company Mental Model

The individual `mind/model.json` captures cognitive style. The company version captures organizational identity:

```yaml
culture:
  decision_style: "consensus-driven with IC authority"
  communication: "async-first, docs over meetings"
  values: ["ship small", "verify on wire", "root cause over quick fix"]

architecture_principles:
  - "Filesystem is the database"
  - "Archive with recall, not delete"
  - "Git tracks changes"

teams:
  - name: platform
    focus: "Infrastructure and tooling"
    members: ["patrick", ...]
  - name: product
    focus: "User-facing features"

guardrails:
  - "Never deploy on Fridays"
  - "All production changes need PR review"

domain_knowledge:
  industry: "AI/developer tools"
  competitors: [...]
```

## Open Questions

### 1. Contribution Review Workflow

What happens when an individual proposes a node for the company graph?

- **Auto-merge threshold**: High-confidence (>0.85) auto-promoted. But what counts as high confidence?
- **Always-human-review**: Safer but creates bottleneck. Who reviews? Team lead? rotating duty?
- **Team-lead-approve**: Each team lead approves contributions in their domain. Requires CODEOWNERS-style mapping.
- **Graduated trust**: New employees require review for first N contributions, then auto-promote.

This depends heavily on company size and trust level.

### 2. Conflict Resolution

What happens when two individuals promote contradictory knowledge?

- **Last-writer-wins**: Simple but loses information.
- **Both kept with contradiction flag**: Librarian merges and notes the contradiction. Company reviews.
- **Confidence-weighted merge**: Higher-confidence node wins, loser archived with note.
- **Human escalation**: Any contradiction triggers review, blocks auto-merge.

The company librarian needs merge logic here. Needs a prompt design.

### 3. Team Membership Resolution

How does the system know which team whisper to inject?

- **Config file**: User declares team in `~/.graph-memory/company/config.yml`
- **Git branch**: User works on a team branch, whisper comes from that branch
- **Auto-detected from project**: Project → team mapping in company graph. Individual contributes to `keel3/oliver` → system knows that's the platform team.
- **Multiple teams**: What if someone works across teams? Inject multiple whispers? Priority?

### 4. Whisper Generation Timing

When are company/team whispers regenerated?

- **On every company librarian run**: Expensive if librarian runs frequently.
- **On mental model change only**: Cheaper but might miss node-level changes that should update the whisper.
- **On schedule (daily)**: Predictable but potentially stale.
- **On contribution merge**: Triggers whisper regen only when new knowledge is integrated.

### 5. Individual-to-Company Node Deduplication

If an individual has a personal node that's promoted to company, what happens to the personal copy?

- **Keep both**: Redundant but safe. Ambient recall might surface both.
- **Replace personal with reference**: Personal node becomes a pointer to company node. Saves tokens but creates dependency.
- **Archive personal**: Personal node archived, company node takes over. Clean but loses personal context.

### 6. Onboarding Bootstrap

How does a new hire get set up?

- **Git clone + configure**: Clone company repo, run `graph_memory(action="initialize")`, set team. Manual but simple.
- **One-command setup**: `graph-memory company join --repo <url> --team platform`. Automates clone, config, skill sync.
- **HR integration**: Company graph URL distributed via onboarding checklist. Plugin reads from standard location.

### 7. Skillforge for Company Skills

How are company skills generated differently from personal skills?

- **Same Skillforge, company nodes as input**: Reuse existing pipeline, just point at company graph.
- **Dedicated company Skillforge**: Separate prompt templates that emphasize organizational procedures over individual patterns.
- **Human-authored skills**: Company skills can be hand-written and committed to `skills/`. Skillforge generates suggestions, not final skills.

### 8. Multi-Company Support

Can an individual participate in multiple company graphs?

- **Yes, multiple clones**: `~/.graph-memory/company-org1/`, `~/.graph-memory/company-org2/`. Independent sync.
- **No, one company at a time**: Simpler. Switch company via config change.
- **Yes, with priority**: Multiple companies inherited, primary company gets higher ambient recall boost.

### 9. Ambient Recall Budget

Searching both personal and company indexes doubles the search space. Token implications?

- **Hard cap on company recall results**: Max 2-3 company nodes per ambient recall invocation.
- **Confidence threshold**: Company nodes need higher score to surface (vs. personal nodes).
- **Category gating**: Only certain company categories are searched via ambient recall (decisions, patterns, architecture — not all 22).

### 10. Offline Operation

What happens when an individual can't reach the company git repo?

- **Stale cache**: Work with last-synced company knowledge. Sync when back online.
- **Queue contributions**: Write contributions locally, push when connected.
- **Degraded mode**: No company recall, no company whispers. Personal graph fully functional.

## Implementation Roadmap

### MVP — "Decisions Don't Die"

The smallest useful version. Every engineer's individual graph works exactly as today, with one addition: decisions are captured with provenance and shared.

**What the CEO does (once):**
1. Has a conversation with the agent: "Tell me about your company. What do you value? What are your dealbreakers?"
2. Agent produces company personality from that conversation
3. CEO reviews, tweaks, approves
4. Agent commits to `company-graph/mind/model.json` + generates company whisper

**What engineers get (day 1):**
1. Existing individual graph — unchanged
2. Company whisper injected at session start (~200 tokens): culture, principles, guardrails
3. Company anti-patterns merged with personal anti-patterns

**What's new in the pipeline:**
1. Librarian tags decision nodes with provenance: who, why, context, authority level
2. After each librarian run, decision nodes are pushed to `company-graph/decisions/` via git
3. No CONTRIBUTOR stage yet — all decisions flow directly. Simple, low-risk because decisions are high-signal.
4. New hires clone the repo, get the personality + all historical decisions immediately

**What's NOT in the MVP:**
- No CONTRIBUTOR pipeline
- No team whispers or team structure
- No org chart integration
- No shared skills
- No ambient recall of company knowledge
- No auto-merge vs. review workflow
- No observed authority graph

**Why this works:**
Decisions are the highest-signal, lowest-noise knowledge type. They're always useful, always grounded in context, and the thing people miss most when someone leaves. Not "what were their preferences" but "why did we choose this database."

**MVP repo structure:**
```
company-graph/
├── mind/
│   ├── model.json          # CEO-declared personality
│   └── whisper.txt         # Pre-compressed (~200 tokens)
├── decisions/              # Synced from individual graphs
│   ├── use-neon-for-services.md
│   ├── railway-three-environments.md
│   └── ...
└── anti-patterns/          # Company-wide anti-patterns
    └── ...
```

**MVP sync flow:**
```
Individual librarian run
  → tags new decision nodes with provenance
  → git push decisions/ to company repo
  → other engineers git pull on next tick
  → decisions available in their session
```

---

### Phase 2 — Shared Patterns & Procedures

Decisions are flowing. Now expand what gets shared beyond just decisions.

**What changes:**
- CONTRIBUTOR pipeline stage added — evaluates all node types for promotion, not just decisions
- Patterns and procedures start flowing to company graph
- Promotion is gated: decisions auto-promote, patterns/procedures require review
- Company whisper expands to include emerging patterns (not just declared personality)

**New knowledge types shared:**
- Patterns: "Validate before declaring done" (from multiple engineers observing the same thing)
- Procedures: "How we deploy" (tacit knowledge that lives in one person's head)
- Architecture: "Our system design for X" (cross-project structural knowledge)

**New repo structure:**
```
company-graph/
├── mind/
│   ├── model.json
│   └── whisper.txt
├── decisions/              # (from MVP — still auto-promotes)
├── patterns/               # NEW — requires review
├── procedures/             # NEW — requires review
├── architecture/           # NEW — requires review
├── anti-patterns/
└── contributions/
    └── pending/            # NEW — proposed additions awaiting review
```

**Key question for Phase 2:** Who reviews? This is where the org chart starts to matter. Without it, reviews fall to a generic "company admin." With it, reviews route to the right team lead.

---

### Phase 3 — Org Chart & Teams

Structure enters the system. Not just "company knowledge" but "team knowledge."

**What changes:**
- Org chart provided at onboarding (declared by leadership)
- Team whispers generated from team models (~200 tokens each)
- Team-scoped knowledge: each team has its own nodes under `teams/{team}/`
- Review workflow routes to team leads based on org chart
- CONTRIBUTOR uses org chart for authority-weighted promotion

**New injection at session start:**
```
Company whisper          ~200 tokens
Team whisper             ~200 tokens   ← NEW
Company anti-patterns    ~100 tokens
Company pinned (max 3)   ~300 tokens
```

**New repo structure:**
```
company-graph/
├── mind/
│   ├── model.json
│   └── whisper.txt
├── teams/
│   ├── platform/
│   │   ├── model.json
│   │   ├── whisper.txt
│   │   └── nodes/        # Team-scoped knowledge
│   └── product/
│       ├── model.json
│       ├── whisper.txt
│       └── nodes/
├── decisions/
├── patterns/
├── procedures/
├── architecture/
├── anti-patterns/
├── contributions/
│   └── pending/
└── org-chart.json        # NEW — declared structure
```

**Key question for Phase 3:** Team membership resolution. How does the system know which team whisper to inject? Auto-detected from project? Config file? Org chart lookup?

---

### Phase 4 — Shared Skills & Onboarding

Company procedures become executable agent skills. Onboarding becomes a first-class experience.

**What changes:**
- Company Skillforge runs on company nodes, generates skill manifests
- Skills synced to individual engineers, discovered alongside personal skills
- Onboarding mode: new hires get curated first-day context (personality + critical decisions + first-day skills)
- Tiered onboarding: first week = personality + anti-patterns; second week = relevant knowledge surfaces as they work

**New skill structure:**
```
company-graph/
├── skills/
│   ├── deploy-to-production/SKILL.md
│   ├── incident-response/SKILL.md
│   ├── code-review/SKILL.md
│   └── .drafts/           # Auto-generated, awaiting review
└── ...
```

**Onboarding flow:**
1. `graph_memory(action="company_join", repo, team)`
2. Clone → cache whispers → discover skills → first session starts with company context
3. Agent already knows the company's procedures and can guide the new hire

---

### Phase 5 — Observed Authority & Decision Lifecycle

The system starts learning from behavior, not just declarations.

**What changes:**
- Observed authority graph: system tracks who actually makes decisions vs. org chart
- Org chart divergence surfaced as health signal to leadership
- Decision lifecycle: challenged → superseded → archived, with full history chain
- Company personality drift detection: system suggests when declared personality may need updating
- Emerging patterns flagged when adoption crosses threshold but no formal declaration exists

**Key insight:** This is where the system becomes a feedback tool for leadership. Not just capturing knowledge, but surfacing how the org actually works vs. how it's declared to work.

**Example signals:**
- "Your org chart says Sarah leads infra, but 80% of infrastructure decisions came from Marcus"
- "The declared principle 'move fast' hasn't been observed in decisions this quarter — engineers are optimizing for stability instead"
- "This anti-pattern has been followed by 6 engineers across 2 teams but isn't in the declared guardrails"

---

### Phase 6 — Ambient Recall & Cross-Team Knowledge

Company knowledge surfaces on-demand during work, not just at session start.

**What changes:**
- Ambient recall searches company index alongside personal index
- Cross-team knowledge: patterns from one team surface for another team when relevant
- Category gating: only high-signal company categories searched (decisions, patterns, architecture)
- Token budget controls: company recall capped at 2-3 nodes, higher confidence threshold

**Key question for Phase 6:** How do you prevent noise? A 200-person company has thousands of company nodes. Ambient recall needs to be precise, not exhaustive.

---

### Phase 7 — Scale & Multi-Company

Enterprise-grade features for larger organizations.

**What changes:**
- Multi-company support (contractors, acquisitions, open-source communities)
- Large-team partitioning (sub-teams, working groups)
- Company graph performance optimization (index sharding, lazy loading)
- Dashboard for company memory health (coverage, staleness, adoption)
- Notion sync for company graph (readable mirror for non-engineers)

---

## Phase Dependency Graph

```
MVP (Decisions)
  │
  ├─→ Phase 2 (Shared Patterns & Procedures)
  │     │
  │     └─→ Phase 3 (Org Chart & Teams)
  │           │
  │           ├─→ Phase 4 (Shared Skills & Onboarding)
  │           │
  │           └─→ Phase 5 (Observed Authority & Decision Lifecycle)
  │                 │
  │                 └─→ Phase 6 (Ambient Recall & Cross-Team)
  │                       │
  │                       └─→ Phase 7 (Scale & Multi-Company)
  │
  └─→ Phase 4 (Shared Skills) ← can start early, only needs decisions + personality
```

Note: Phase 4 (Skills) can start before Phase 3 because it only needs decisions and personality — it doesn't require team structure. Skills can be company-wide from the start, then gain team-scoping later.

## Research Notes

See companion files in this directory:
- `BRAINSTORM.md` — Session reasoning trail and open threads
- `OPEN-QUESTIONS.md` — Deep dives on each open question
- `COMPANY-MENTAL-MODEL.md` — What does a company "think"? Schema design, org chart, provenance.
- `PROMOTION-PIPELINE.md` — CONTRIBUTOR stage prompt design and logic
- `SYNC-PROTOCOL.md` — Git-based sync protocol specification
- `SKILLS.md` — Shared skills architecture and discovery
