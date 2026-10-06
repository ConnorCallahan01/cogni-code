#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

container_codex() {
  docker exec \
    -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
    "$GRAPH_MEMORY_DOCKER_CONTAINER" \
    bash -lc "$1"
}

container_codex 'codex login status'

# `codex login status` only checks that auth.json exists: it still reports
# "Logged in" after OpenAI has revoked the refresh token, while every worker
# fails on a 401. Prove the credentials with one minimal live request.
echo "Verifying codex credentials with a live request..."
if PROBE_OUTPUT=$(container_codex 'cd /tmp && codex exec --skip-git-repo-check --color never "Reply with exactly: ok"' 2>&1); then
  echo "Live check passed: codex credentials accepted."
  # Lift any rejection a failed worker run recorded, so fallbacks use codex again.
  node --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const [modulePath, graphRoot] = process.argv.slice(1);
    const { clearAuthRejection } = await import(pathToFileURL(modulePath).href);
    clearAuthRejection(graphRoot, "codex");
  ' "$DIR/dist/graph-memory/pipeline/worker-auth.js" "$GRAPH_MEMORY_HOST_ROOT" \
    || echo "Warning: could not clear the recorded codex rejection in $GRAPH_MEMORY_HOST_ROOT/.jobs/worker-auth.json"
  exit 0
fi

echo "Live check FAILED: codex reports a login, but its credentials were rejected."
printf '%s\n' "$PROBE_OUTPUT" | grep -E 'ERROR' | tail -3 || true
exit 1
