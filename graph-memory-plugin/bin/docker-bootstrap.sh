#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

if [ "$GRAPH_MEMORY_RUNTIME_MODE" != "docker" ]; then
  echo "Runtime mode is $GRAPH_MEMORY_RUNTIME_MODE, not docker. Configure docker mode first."
  exit 1
fi

source "$DIR/bin/docker-engine-check.sh"

PROVIDER="${GRAPH_MEMORY_WORKER_PROVIDER:-}"

echo "=== graph-memory bootstrap ==="
echo "Worker provider: ${PROVIDER:-auto}"
echo

echo "[1/5] Building image..."
# The image consumes prebuilt dist/ — compile on the host when running from a source checkout.
if [ ! -d "$DIR/dist" ]; then
  if [ -d "$DIR/src" ]; then
    echo "  dist/ missing — building on host..."
    (cd "$DIR" && npm install && npm run build)
  else
    echo "ERROR: $DIR/dist not found and no src/ to build from." >&2
    exit 1
  fi
fi
docker build -f "$DIR/docker/Dockerfile" -t "$GRAPH_MEMORY_DOCKER_IMAGE" "$DIR" --quiet
echo "  Image: $GRAPH_MEMORY_DOCKER_IMAGE"

echo "[2/5] Starting container..."
# docker-start.sh holds the container's flags, containment included.
"$DIR/bin/docker-start.sh" >/dev/null

echo "[3/5] Waiting for healthcheck..."
attempt=0
until "$DIR/bin/docker-healthcheck.sh" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    echo "  FAILED - healthcheck did not pass in time."
    docker logs "$GRAPH_MEMORY_DOCKER_CONTAINER" 2>&1 | tail -20
    exit 1
  fi
  sleep 2
done
echo "  Healthy."

echo "[4/5] Importing auth + updating plugin..."
docker cp "$DIR/extensions/graph-memory-opencode.ts" "$GRAPH_MEMORY_DOCKER_CONTAINER:$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config/opencode/plugins/graph-memory.ts" 2>/dev/null && echo "  plugin: updated" || echo "  plugin: no extension found (skipped)"
AUTH_IMPORTED=false

if [ "$PROVIDER" = "opencode" ] || [ "$PROVIDER" = "auto" ] || [ -z "$PROVIDER" ]; then
  if [ -f "$HOME/.local/share/opencode/auth.json" ] || [ -d "$HOME/.config/opencode" ]; then
    echo "  opencode: importing host auth and provider config..."
    if OPENCODE_IMPORT_OUTPUT=$("$DIR/bin/docker-opencode-import-host-auth.sh" 2>&1); then
      AUTH_IMPORTED=true
      printf '%s\n' "$OPENCODE_IMPORT_OUTPUT" | grep -iE 'model' | sed 's/^/    /' || true
    else
      echo "  opencode: host auth not imported:"
      printf '%s\n' "$OPENCODE_IMPORT_OUTPUT" | sed 's/^/    /'
    fi
  else
    echo "  opencode: no auth found at $HOME/.local/share/opencode/auth.json"
  fi
fi

if [ "$PROVIDER" = "codex" ] || [ "$PROVIDER" = "auto" ] || [ -z "$PROVIDER" ]; then
  if command -v codex >/dev/null 2>&1 && codex login status >/dev/null 2>&1; then
    echo "  codex: importing host auth..."
    if CODEX_IMPORT_OUTPUT=$("$DIR/bin/docker-codex-import-host-auth.sh" 2>&1); then
      AUTH_IMPORTED=true
    else
      echo "  codex: host auth not imported:"
      printf '%s\n' "$CODEX_IMPORT_OUTPUT" | sed 's/^/    /'
    fi
  else
    echo "  codex: no host auth"
  fi
fi

if [ "$PROVIDER" = "claude" ] || [ "$PROVIDER" = "auto" ] || [ -z "$PROVIDER" ]; then
  if command -v claude >/dev/null 2>&1 && claude auth status >/dev/null 2>&1; then
    echo "  claude: importing host auth..."
    "$DIR/bin/docker-claude-import-host-auth.sh" >/dev/null 2>&1 && AUTH_IMPORTED=true || echo "  claude: import failed"
  else
    echo "  claude: no host auth"
  fi
fi

echo "[5/5] Status..."
echo
docker logs "$GRAPH_MEMORY_DOCKER_CONTAINER" 2>&1 | head -20
echo
echo "=== bootstrap complete ==="
if [ "$AUTH_IMPORTED" = false ]; then
  echo "WARNING: No auth was imported. Pipeline workers may fail."
fi
