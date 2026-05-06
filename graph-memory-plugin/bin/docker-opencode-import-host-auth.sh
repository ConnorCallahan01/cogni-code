#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_CONFIG="$HOME/.config/opencode"
CONTAINER_CONFIG_DIR="$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config/opencode"

if [ ! -d "$HOST_CONFIG" ]; then
  echo "No ~/.config/opencode/ directory found on the host."
  echo "Run 'opencode providers' on the host to configure a provider first."
  exit 1
fi

if [ ! -f "$HOST_CONFIG/config.json" ]; then
  echo "No ~/.config/opencode/config.json found on the host."
  echo "Run 'opencode providers' on the host to configure a provider first."
  exit 1
fi

docker run --rm \
  -v "$GRAPH_MEMORY_DOCKER_AUTH_VOLUME:$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  -v "$HOST_CONFIG:/host-opencode-config:ro" \
  alpine sh -c "mkdir -p '$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config' && cp -r /host-opencode-config '$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config/opencode'"

echo "opencode auth imported into container."
echo

"$DIR/bin/docker-opencode-auth-status.sh"
