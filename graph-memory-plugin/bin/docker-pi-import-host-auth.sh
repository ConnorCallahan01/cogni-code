#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_PI_DIR="$HOME/.pi"
CONTAINER_PI_DIR="$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.pi"

if [ ! -d "$HOST_PI_DIR" ]; then
  echo "No ~/.pi/ directory found on the host."
  echo "Run 'pi' and authenticate (/login or set API keys) on the host first."
  exit 1
fi

if [ ! -f "$HOST_PI_DIR/agent/auth.json" ]; then
  echo "No ~/.pi/agent/auth.json found on the host."
  echo "Run 'pi' and authenticate on the host first."
  exit 1
fi

# Copy what pi needs to authenticate and pick a model, not the whole ~/.pi:
# its sessions are host transcripts, and workers can read their auth volume.
# The copy runs in the daemon image itself rather than a separately pulled one.
docker run --rm --network none --entrypoint sh \
  -v "$GRAPH_MEMORY_DOCKER_AUTH_VOLUME:$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  -v "$HOST_PI_DIR/agent:/host-pi-agent:ro" \
  "$GRAPH_MEMORY_DOCKER_IMAGE" -c "mkdir -p '$CONTAINER_PI_DIR/agent' && for f in auth.json settings.json models.json; do if [ -f /host-pi-agent/\$f ]; then cp /host-pi-agent/\$f '$CONTAINER_PI_DIR/agent/'\$f; fi; done && chmod 600 '$CONTAINER_PI_DIR/agent/auth.json'"

echo "pi auth imported into container."
echo

# Verify
"$DIR/bin/docker-pi-auth-status.sh"
