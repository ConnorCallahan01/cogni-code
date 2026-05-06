# /refresh-skill

Refresh a skillforged skill that may have drifted from its source node.

## Instructions

1. Call `graph_memory(action="status")` to verify the system is initialized.
2. If the user specifies a skill name or node path:
   a. Call `graph_memory(action="read_node", path="<nodePath>")` to read the source node
   b. Check if a manifest exists at `~/.graph-memory/.skillforge/<sanitized-path>.json`
   c. If no manifest found, tell the user this node hasn't been skillforged yet and suggest waiting for the automatic scorer
3. If the user doesn't specify a skill, list all manifests:
   a. Read all JSON files in `~/.graph-memory/.skillforge/`
   b. Present a summary table: skill name, source node, last refreshed, project
   c. Ask which skill to refresh
4. To trigger a refresh, enqueue a job:
   ```
   Use Bash to run: node -e "..." that calls enqueueJob with type "skillforge_refresh"
   ```
   Or call `graph_memory` with the appropriate action if supported.
5. Report success and the job ID back to the user.

## Notes

- Skills are automatically refreshed when their source node content changes (drift detection runs every daemon tick)
- Use this command for manual refresh if you want to force an update outside the daemon cycle
- Refreshing overwrites the existing skill files with updated content from the source node
