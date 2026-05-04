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

# Copy the full .pi directory into the container's auth volume
docker run --rm \
  -v "$GRAPH_MEMORY_DOCKER_AUTH_VOLUME:$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  -v "$HOST_PI_DIR:/host-pi:ro" \
  alpine cp -r /host-pi "$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.pi"

echo "pi auth imported into container."
echo

# Verify
"$DIR/bin/docker-pi-auth-status.sh"
