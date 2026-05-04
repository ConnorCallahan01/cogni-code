#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

if docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'test -f "$HOME/.pi/agent/auth.json"' 2>/dev/null; then

  AUTH_FILE=$(docker exec \
    -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
    "$GRAPH_MEMORY_DOCKER_CONTAINER" \
    bash -lc 'cat "$HOME/.pi/agent/auth.json"' 2>/dev/null || echo "")

  if [ -n "$AUTH_FILE" ] && echo "$AUTH_FILE" | grep -qE '"key"|"token"|"oauth"|"apiKey"|"api_key"'; then
    echo "pi auth is ready inside the container."
    exit 0
  fi
fi

echo "pi auth is NOT ready inside the container."
echo
echo "Copy your host pi auth into the container with:"
echo "  $DIR/bin/docker-pi-import-host-auth.sh"
echo
exit 1
