#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

if [ "$GRAPH_MEMORY_RUNTIME_MODE" != "docker" ]; then
  echo "Runtime mode is $GRAPH_MEMORY_RUNTIME_MODE, not docker. Configure docker mode first."
  exit 1
fi

source "$DIR/bin/docker-engine-check.sh"

mkdir -p "$GRAPH_MEMORY_HOST_ROOT"

GRAPH_MEMORY_HOST_TIMEZONE="${TZ:-$(systemsetup -gettimezone 2>/dev/null | awk -F': ' 'NF>1{print $2}' || true)}"
if [ -z "${GRAPH_MEMORY_HOST_TIMEZONE:-}" ]; then
  GRAPH_MEMORY_HOST_TIMEZONE="UTC"
fi

if ! docker image inspect "$GRAPH_MEMORY_DOCKER_IMAGE" >/dev/null 2>&1; then
  "$DIR/bin/docker-build.sh"
fi

docker rm -f "$GRAPH_MEMORY_DOCKER_CONTAINER" >/dev/null 2>&1 || true

# Workers run with their harness's permission checks off, so the container is
# what holds them in: they can write the graph and their own auth volume, and
# nothing else. The image is read-only, and root keeps only the two
# capabilities it needs for files the host user owns. The files that steer the
# host -- the runtime config the docker scripts eval, the pipeline's own
# credentials, and the graph's git config and hooks -- are mounted read-only
# over the writable graph.
CONTAINMENT=(
  --read-only
  --tmpfs /tmp:rw,exec,nosuid,size=1g
  --cap-drop ALL --cap-add DAC_OVERRIDE --cap-add FOWNER
  --security-opt no-new-privileges
)

# Left absent, the pipeline .env could be created by a worker, pointing the
# next worker's provider at an endpoint of its choosing. An empty one changes
# nothing. Restart the daemon after editing it.
[ -e "$GRAPH_MEMORY_HOST_ROOT/.env" ] || : > "$GRAPH_MEMORY_HOST_ROOT/.env"
chmod 600 "$GRAPH_MEMORY_HOST_ROOT/.env" 2>/dev/null || true

READ_ONLY_MOUNTS=()
for rel in .runtime-config.json .env .git/config .git/hooks; do
  if [ -e "$GRAPH_MEMORY_HOST_ROOT/$rel" ]; then
    READ_ONLY_MOUNTS+=(-v "$GRAPH_MEMORY_HOST_ROOT/$rel:$GRAPH_MEMORY_CONTAINER_ROOT/$rel:ro")
  fi
done

docker run -d \
  --name "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  --restart unless-stopped \
  --memory "$GRAPH_MEMORY_MEMORY_LIMIT" \
  --cpus "$GRAPH_MEMORY_CPU_LIMIT" \
  "${CONTAINMENT[@]}" \
  -e GRAPH_MEMORY_DAEMON=1 \
  -e GRAPH_MEMORY_ROOT="$GRAPH_MEMORY_CONTAINER_ROOT" \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  -e TZ="$GRAPH_MEMORY_HOST_TIMEZONE" \
  -v "$GRAPH_MEMORY_HOST_ROOT:$GRAPH_MEMORY_CONTAINER_ROOT" \
  ${READ_ONLY_MOUNTS[@]+"${READ_ONLY_MOUNTS[@]}"} \
  -v "$GRAPH_MEMORY_DOCKER_AUTH_VOLUME:$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_IMAGE"
