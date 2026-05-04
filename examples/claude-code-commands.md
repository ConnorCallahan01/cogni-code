# Claude Code Command Examples

These examples show how the installed slash commands are meant to be used in Claude Code after running `graph-memory-plugin/bin/install.sh`.

## First-Time Setup

```text
/memory-onboard
```

Expected outcome:

- checks current graph status
- lets you choose graph storage
- configures manual or Docker runtime
- seeds initial memory nodes

## Health Check

```text
/memory-status
```

Expected outcome:

- reports graph root, runtime mode, node count, pending jobs, and warnings

## Search The Graph

```text
/memory-search project naming conventions
```

Expected outcome:

- searches the graph index
- returns matching node paths, scores, and short gists

## Morning Kickoff

```text
/memory-morning-kickoff
```

Expected outcome:

- turns the latest morning brief into a focused work kickoff for the current repo

## Wire Memory Into A Project

```text
/memory-wire-project
```

Expected outcome:

- inserts (or refreshes) the graph-memory section into CLI documentation for the active project
- safe to re-run — idempotent

## Switch Worker Harness

```text
/memory-switch-harness
```

Expected outcome:

- switches the background pipeline worker between codex, claude, and pi
- no manual config editing required

## Deep Recall Skill

The plugin also ships a user-invocable recall skill:

```text
/recall shipping incidents
```

Expected outcome:

- calls `graph_memory(action="recall", query="shipping incidents", depth=2)`
- optionally reads the top matching nodes
- summarizes direct hits and connected context
