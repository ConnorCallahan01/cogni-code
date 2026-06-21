# Company Memory — Brainstorm Session Log

> Chronological record of design reasoning. Captures the conversation, not just the conclusions.

## Session 1: 2026-05-29

### Participants
- Patrick (product vision)
- Agent (technical design)

### Thread 1: What Knowledge Survives?

**Q**: What knowledge should survive a person leaving the company?

Three tiers of survival value:
1. **Decisions with reasoning** — "We chose Neon over Supabase because..." The reasoning is more valuable than the decision because conditions change.
2. **Procedures that encode tacit knowledge** — "How we actually deploy" vs. what the docs say. Lives in one person's head, dies with them.
3. **Anti-patterns from lived experience** — "Don't do X, we tried it and it created a feedback loop." Most valuable and most likely to be lost.

These three tiers give the CONTRIBUTOR stage a natural filter — not "is this useful?" but specific questions:
- Is this a decision with reasoning attached? → Promote.
- Is this a procedure that isn't documented anywhere else? → Promote.
- Is this a "don't do X" lesson from production experience? → Promote.

### Thread 2: Declared vs. Emergent Knowledge

**Key insight**: Individual mental models are **emergent** (discovered by observation). Company mental models must be **declared** (stated by leadership).

The CEO sets the company personality. It's not inferred from watching engineers — it's stated, and the system uses it as a filter.

This creates a productive tension loop:
- **Top-down**: CEO declares personality → filters promotion → injected to everyone
- **Bottom-up**: Engineers discover patterns → evaluated against declared personality → misalignment surfaces as health signal

If the CONTRIBUTOR keeps flagging things that contradict the company personality, maybe the personality is stale. That's a signal to leadership.

### Thread 3: Org Chart as Structural Truth

**Q**: How does the system know team membership, authority, domain ownership?

**A**: Org chart provided at onboarding. Not auto-detected — declared.

The org chart gives the system:
1. **Team membership** — which whisper to inject
2. **Authority hierarchy** — whose decisions carry weight, who can approve contributions
3. **Domain ownership** — which team owns which knowledge areas

This simplifies the promotion pipeline: instead of a generic "domain steward" concept, it's the actual team lead for that domain. A senior engineer promoting a decision in their domain → auto-merge candidate. A junior engineer promoting a decision outside their domain → always review.

### Thread 4: Decision Provenance

**Q**: Not just "what was decided" but "who decided it?"

Every promoted node needs a provenance chain:
- Who raised the issue?
- Who made the call?
- What authority level do they have?
- Has it been challenged?
- Is it still active?

Two types of company knowledge:
1. **Decided** — formal decision with authority (executive or team-lead approved)
2. **Emerging** — observed pattern with adoption but no formal declaration

Both are valuable, but carry different weight. The system should surface emerging patterns that are ready for formal declaration.

### Thread 5: Observed Authority Graph

**Q**: What happens when the org chart and reality diverge?

The org chart declares who *should* have authority. The system observes who *actually* has authority by tracking decision provenance.

If the org chart says Sarah leads infra, but 80% of infrastructure decisions came from Marcus, that's not a problem — it's an insight. The CEO might want to know.

This is a health signal, not an auto-correction. The system surfaces the divergence; humans decide what to do about it.

### Open Threads for Next Session

1. **How does a CEO actually create/edit the company personality?** CLI command? Web UI? Conversation with the agent? Needs to feel natural, not like filling out a form.

2. **What happens when a decision is challenged?** Is there a process for updating or reversing decisions? Does the provenance chain show the full history?

3. **How does the system handle cross-team knowledge?** Patterns that span teams, decisions that affect multiple teams, people who work across teams.

4. **What's the MVP?** What's the smallest useful version of this that a 5-person startup could use?

5. **Onboarding UX** — The new hire experience. Clone repo, first session, what do they see? How long until the system is useful to them?

6. **Company personality drift detection** — How often should the system suggest updates to the declared personality? What's the signal?

7. **Privacy at the boundary** — What if someone wants to contribute knowledge without attaching their name to it? Anonymous contributions?

### Thread 6: CEO UX — How Does Leadership Set the Personality?

**Q**: How does a CEO actually create/edit the company personality?

**A**: Conversation, not a form. The agent asks: "Tell me about your company. What do you build? What do you value? What are your dealbreakers?" The system produces the mental model from that conversation. CEO reviews, tweaks, approves. Updates are the same — a conversation.

**Key insight: stable vs. living split.**

The CEO's declaration has two layers:
1. **Stable stuff** — values, principles, guardrails. Changes rarely. "Ship small, verify on the wire." This is identity.
2. **Living stuff** — current priorities, team structure, active projects. Changes often. Reorg, new hire, pivot.

Stable stuff is hard to change (requires intentionality). Living stuff is easy to update, maybe even auto-detected from org chart and project activity.

The CEO sets identity once. The system keeps structure current by observing. CEO only intervenes when divergence surfaces.

### Thread 7: Onboarding Tiers

**Q**: What does a new hire see in their first session?

**A**: Tiered, not dumped.

- **First week**: Personality + anti-patterns. Just the culture — who we are, what we don't do.
- **Second week**: Relevant knowledge starts surfacing as they work. Ambient discovery of decisions and patterns related to what they're actually doing.
- **Ongoing**: Full access to company knowledge, but surfaced contextually, not all at once.

This feels more natural than overwhelming a new hire with 200 decisions on day 1.

### Thread 8: The MVP — "Decisions Don't Die"

**Q**: What's the smallest useful version?

**A**: Just decisions. No teams, no skills, no CONTRIBUTOR pipeline, no org chart.

1. CEO has one conversation → company personality gets set
2. Engineers use existing plugin → individual graphs unchanged
3. One new thing: decisions get provenance tags and sync to shared git repo
4. New hires clone repo → get personality + all historical decisions

**Why decisions first:**
- Highest signal, lowest noise
- Always useful, always grounded in context
- The thing people miss most when someone leaves
- Simplest to build — no review workflow needed, decisions auto-promote
- Individual graphs don't change at all

**What comes after MVP (roadmap):**
- Phase 2: Shared patterns & procedures (CONTRIBUTOR stage, review workflow)
- Phase 3: Org chart & teams (structure, team whispers, authority routing)
- Phase 4: Shared skills & onboarding (Skillforge for company, new hire experience)
- Phase 5: Observed authority & decision lifecycle (behavior-based insights, leadership signals)
- Phase 6: Ambient recall & cross-team knowledge (on-demand company knowledge)
- Phase 7: Scale & multi-company (enterprise features)

### Open Threads for Next Session

1. **Decision lifecycle** — What happens when a decision is challenged or reversed? Is there a formal process? Does the provenance chain show full history?

2. **CEO personality editing UX** — The initial conversation makes sense. What about edits? Quarterly review? Agent-initiated suggestions? What's the cadence?

3. **Cross-team knowledge** — Patterns that span teams, decisions that affect multiple teams, people who work across teams. How does the system handle these?

4. **MVP implementation plan** — Concrete: which files change, what's the sync mechanism, how does the librarian tag decisions with provenance?

5. **Privacy at the boundary** — What if someone wants to contribute knowledge without attaching their name? Anonymous contributions?

6. **Decision quality signals** — How does the system know if a decision was good? Outcome tracking? Retrospective linking?

7. **Company personality drift detection** — How often should the system suggest updates? What's the signal that the declared personality is stale?
