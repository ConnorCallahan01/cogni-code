---
description: Refresh a skillforged skill — update from source node or list all skills
---

# /refresh-skill

Refresh a skillforged skill that may have drifted from its source node.

## Instructions

1. Call `graph_memory` with action `status` to verify the system is initialized.
2. If the user specifies a skill name or node path:
   a. Call `graph_memory` with action `read_node` and the path to read the source node
   b. Check if a manifest exists at `~/.graph-memory/.skillforge/<sanitized-path>.json`
   c. If no manifest found, tell the user this node hasn't been skillforged yet and suggest waiting for the automatic scorer
3. If the user doesn't specify a skill, list all manifests:
   a. Read all JSON files in `~/.graph-memory/.skillforge/`
   b. Present a summary table: skill name, source node, last refreshed, project
   c. Ask which skill to refresh
4. To trigger a refresh, run via Bash:
   ```bash
   node -e "
   const {enqueueJob} = await import(process.env.HOME + '/.graph-memory/node_modules/graph-memory/dist/graph-memory/pipeline/job-queue.js');
   const {job, created} = enqueueJob({
     type: 'skillforge_refresh',
     payload: { manifestPath: '<manifestPath>', nodePath: '<nodePath>', skillName: '<skillName>', project: '<project>', reason: 'manual refresh via /refresh-skill' },
     triggerSource: 'slash:refresh-skill',
     idempotencyKey: 'skillforge-refresh:<nodePath>:manual:' + Date.now(),
   });
   console.log('Enqueued:', created, job.id);
   "
   ```
5. Report success and the job ID back to the user.

## Notes

- Skills are automatically refreshed when their source node content changes (drift detection runs every daemon tick)
- Use this command for manual refresh if you want to force an update outside the daemon cycle
- Refreshing overwrites the existing skill files with updated content from the source node
