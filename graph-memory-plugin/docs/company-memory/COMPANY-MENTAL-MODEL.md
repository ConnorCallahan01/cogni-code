# Company Mental Model — Schema Design

> What does a company "think"? The organizational analogue to the individual mental model.

## Key Principle: Declared, Not Discovered

The individual mental model is **emergent** — the system observes a person and discovers how they think. The company mental model is **declared** — leadership states who we are, what we value, and how we build. The system does not infer company culture from employee behavior. It receives it from the CEO/top executive and uses it as a filter for knowledge promotion.

The company personality is the north star. Everything promoted to the company graph is evaluated against it. When promoted knowledge consistently contradicts the personality, that's a signal that the personality may need updating — not that the knowledge is wrong.

## Individual vs. Company Mental Model

| Aspect | Individual (`mind/model.json`) | Company (`company-graph/mind/model.json`) |
|--------|------|---------|
| Purpose | How I think and work | How we think and work |
| Source | Emergent (observed by system) | Declared (set by CEO/executive) |
| Scope | Personal preferences, cognitive style | Culture, principles, shared procedures |
| Privacy | Fully private | Shared with all employees |
| Updates | Personal librarian | CEO/admin edits, company librarian suggests |
| Injection | Always, unconditional | Always, via whisper |

## Proposed Schema

```typescript
interface CompanyMentalModel {
  version: 1;
  
  // === DECLARED BY CEO/EXECUTIVE ===
  // This section is top-down. Not inferred. Leadership states it.
  
  declared_by: {
    person: string;               // "Patrick Callahan"
    role: string;                 // "CEO" / "CTO"
    date: string;                 // When this was last updated
  };
  
  // Core identity
  company: {
    name: string;
    description: string;          // One-liner: what does this company do?
    stage: 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'growth' | 'mature';
    headcount_range: string;      // "10-50", "50-200", etc.
  };

  // Culture — how we make decisions and communicate
  culture: {
    decision_style: string;       // "consensus-driven with IC authority"
    communication: string;        // "async-first, docs over meetings"
    meeting_cadence: string;      // "weekly standup, monthly all-hands"
    review_culture: string;       // "PRs required for all production changes"
    values: string[];             // ["ship small", "verify on wire", "root cause over quick fix"]
    anti_values: string[];        // Things we explicitly don't do: ["perfectionism", "big-bang deploys"]
  };

  // Architecture principles — how we build
  architecture_principles: string[];
  // Example: [
  //   "Filesystem is the database",
  //   "Archive with recall, not delete",
  //   "Git tracks changes",
  //   "Wire trust over summary trust",
  //   "Structural prevention at boundary contracts"
  // ]

  // Guardrails — things we never do
  guardrails: string[];
  // Example: [
  //   "Never deploy on Fridays",
  //   "All production changes need PR review",
  //   "Never commit secrets",
  //   "Never skip tests for green-field code"
  // ]

  // === STRUCTURAL — ORG CHART ===
  // Provided at onboarding. Determines team membership, authority, domain ownership.
  
  org_chart: OrgChart;  // See org chart schema below

  // Teams — where knowledge lives
  teams: {
    name: string;
    focus: string;                // "Infrastructure and tooling"
    repos: string[];              // ["ConnorCallahan01/cogni-code", "ConnorCallahan01/oliver"]
    tech_stack: string[];         // ["TypeScript", "React", "Railway", "Neon"]
    conventions: string[];        // Team-specific coding conventions
    lead: string;                 // Team lead — authority over team knowledge
    members: {
      name: string;
      role: string;
      authority: string[];        // Domains this person has authority over
    }[];
  }[];

  // Shared procedures — cross-cutting processes
  procedures: {
    name: string;
    path: string;                 // Reference to node: "procedures/deploy-to-production"
    trigger: string;              // "When shipping to production"
    skill: boolean;               // Is this a Skillforge-generated skill?
  }[];

  // Domain knowledge — industry context
  domain: {
    industry: string;
    customers: string;            // "Developers building AI-powered products"
    competitors: string[];
    key_concepts: string[];       // Domain terms everyone should know
  };

  // Onboarding — what new hires need to know
  onboarding: {
    first_day_skills: string[];   // Skills to surface immediately
    critical_nodes: string[];     // Must-read nodes for new hires
    setup_guide: string;          // Path to setup procedure node
  };
}
```

## Whisper Generation

The company whisper compresses the full model into ~200 tokens. Generation prompt:

```
You are generating a compressed context paragraph for an AI agent. This paragraph will be injected at the start of every coding session for every employee.

Given this company mental model, produce a single paragraph (~200 tokens) that captures:
1. Company identity and stage
2. Core cultural values (top 3-5)
3. Architecture principles (top 3-5)
4. Active guardrails (top 3-5)
5. Current team focus areas

Write in imperative/descriptive voice. Be specific. Avoid filler.

Example output:
"Acme Corp (series-A, 30 people) builds AI-powered developer tools. Culture: ship small, verify on wire, root cause over quick fix. Architecture: filesystem as database, git tracks changes, boundary-contract prevention. Guardrails: no Friday deploys, PRs required, no committed secrets. Platform team: cogni-code, Oliver (TypeScript, Railway, Neon). Product team: OpenPatient, Acellus (Next.js, Clerk)."
```

## Team Mental Model

Each team has a scoped model focused on execution:

```typescript
interface TeamMentalModel {
  version: 1;
  
  team: {
    name: string;
    focus: string;
    members: string[];
  };

  tech_stack: {
    languages: string[];
    frameworks: string[];
    infrastructure: string[];
    databases: string[];
    testing: string[];
  };

  conventions: {
    naming: string;               // "camelCase for variables, PascalCase for components"
    file_structure: string;       // "src/components/ for React, src/services/ for API"
    commit_style: string;         // "Conventional commits"
    pr_size: string;              // "Small PRs (< 400 lines). Break large changes into stacks."
  };

  active_work: {
    current_priorities: string[];
    open_threads: string[];
    known_issues: string[];
  };

  procedures: string[];           // References to team-specific procedure nodes
}
```

## Whisper Budget Allocation

```
Company whisper:  ~200 tokens (culture, principles, guardrails)
Team whisper:     ~200 tokens (tech stack, conventions, active work)
Company anti-patterns: ~100 tokens (merged with personal anti-patterns)
Company pinned:  ~300 tokens (max 3-5 nodes)

Total new overhead: ~800 tokens
```

## Evolution Path

1. **v1**: Static company model, admin-edited JSON file
2. **v2**: Company librarian auto-updates model from node trends (most-accessed patterns become principles)
3. **v3**: Democratic model — team members propose changes to model, steward approves
4. **v4**: Model divergence detection — flag when individual mental models contradict company model
5. **v5**: Observed authority graph — surface gaps between declared org chart and actual decision-making patterns

## Org Chart — Structural Truth

The org chart is provided at onboarding and gives the system three things:

1. **Team membership** — which team whisper to inject, which team knowledge to inherit
2. **Authority hierarchy** — who can approve what knowledge, whose decisions carry more weight
3. **Domain ownership** — which team owns which knowledge areas (repos, services, infrastructure)

```typescript
interface OrgChart {
  version: 1;
  
  executives: {
    role: string;                 // "CEO", "CTO", "VP Engineering"
    person: string;               // Name or employee ID
    authority: string[];          // What they have final say on: ["company-personality", "architecture-principles"]
  }[];
  
  teams: {
    name: string;
    lead: string;                 // Team lead — authority over team knowledge
    members: {
      name: string;
      role: string;               // "senior engineer", "junior engineer", etc.
      joined: string;             // ISO date — affects trust/authority weight
      authority: string[];        // Domain areas this person has authority over
    }[];
    owns: {
      repos: string[];            // GitHub repos this team owns
      services: string[];         // Production services this team owns
      knowledge_domains: string[];// Categories this team is authority on
    };
  }[];
  
  // Cross-cutting — people who span teams
  individual_contributors: {
    name: string;
    teams: string[];              // Teams they work across
    authority: string[];
  }[];
}
```

### Why This Matters for Promotion

When the CONTRIBUTOR stage evaluates a node for promotion, it checks:
- Who created it? (from individual's identity)
- What's their role and tenure? (from org chart)
- Do they have authority in this domain? (from `knowledge_domains` or `authority`)
- Who needs to review it? (team lead for that domain)

A senior engineer on the platform team promoting an infrastructure decision → auto-merge candidate (they have authority).
A junior engineer on the product team promoting an infrastructure decision → always review (no authority in that domain).

## Decision Provenance Schema

Every promoted node carries provenance metadata in its frontmatter:

```yaml
id: decisions/use-neon-for-new-services
provenance:
  origin:
    person: "patrick"
    role: "senior engineer"
    team: "platform"
  context: "Evaluated after Supabase connection pooling issues in production"
  approved_by: "cto"
  decided_at: "2026-03-15"
  authority_level: "executive"     # executive | team-lead | senior | contributor
  
  # Lifecycle tracking
  status: "active"                 # active | challenged | superseded | archived
  challenged_count: 0
  last_challenged: null
  superseded_by: null              # Path to node that replaced this one
  
  # Adoption tracking  
  adopted_by_teams: ["platform", "product"]
  observed_following: 8            # Number of individual graphs that reference this
  emerging: false                  # True if pattern is adopted but not yet declared
```

### Authority Levels

| Level | Who | Auto-promote? | Review required? |
|-------|-----|--------------|-----------------|
| executive | CEO, CTO, VP | Yes (in their authority domain) | No |
| team-lead | Team lead | Yes (in team domain) | No |
| senior | Senior engineer | In domain, high confidence | For cross-team decisions |
| contributor | Anyone else | No | Always |

### Emerging vs. Decided

```yaml
# Decided — formal decision with authority
provenance:
  authority_level: "executive"
  status: "active"
  emerging: false

# Emerging — observed pattern with adoption but no formal declaration
provenance:
  authority_level: "contributor"
  status: "active"
  emerging: true
  adopted_by_individuals: ["patrick", "sarah", "marcus"]
  # System can surface: "This pattern is followed by 3 engineers but not yet a declared team practice"
```

## Observed Authority Graph

The system tracks who actually makes decisions, separate from the declared org chart:

```typescript
interface AuthorityObservation {
  person: string;
  domain: string;                  // "infrastructure", "api-design", "testing"
  decisions_originated: number;    // How many decisions this person started
  decisions_approved: number;      // How many decisions this person approved
  patterns_contributed: number;    // How many promoted patterns came from them
  times_challenged: number;        // How often their decisions get challenged
  challenge_success_rate: number;  // How often challenges to their decisions succeed
}
```

Over time, the system can surface:
- **De facto authorities**: "Marcus originated 80% of infrastructure decisions despite not being the team lead"
- **Unchallenged domains**: "No testing decisions have ever been challenged — the team defers to whoever makes the call"
- **Knowledge gaps**: "No one has made decisions about observability strategy — this domain has no authority"
- **Org chart divergence**: "The declared team lead has originated 0 decisions in their domain this quarter"
