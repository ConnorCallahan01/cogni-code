#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_CONFIG="$HOME/.config/opencode"
HOST_DATA="$HOME/.local/share/opencode"

IMPORTED=false

# Copies run in the daemon image itself, already on this machine, rather than a
# separately pulled one.
if [ -d "$HOST_DATA" ] && [ -f "$HOST_DATA/auth.json" ]; then
  echo "Importing opencode auth from: $HOST_DATA/auth.json"
  docker run --rm --network none --entrypoint sh \
    -v "$GRAPH_MEMORY_DOCKER_AUTH_VOLUME:$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
    -v "$HOST_DATA/auth.json:/host-auth.json:ro" \
    "$GRAPH_MEMORY_DOCKER_IMAGE" -c "mkdir -p '$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.local/share/opencode' && cp /host-auth.json '$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.local/share/opencode/auth.json' && chmod 600 '$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.local/share/opencode/auth.json'"
  IMPORTED=true
fi

HOST_CONFIG_FILE=""
if [ -d "$HOST_CONFIG" ]; then
  for f in "$HOST_CONFIG/opencode.json" "$HOST_CONFIG/opencode.jsonc" "$HOST_CONFIG/config.json"; do
    if [ -f "$f" ]; then
      HOST_CONFIG_FILE="$f"
      break
    fi
  done
fi

if [ "$IMPORTED" = true ] || [ -n "$HOST_CONFIG_FILE" ]; then
  # Model precedence: the configured pipeline worker model wins. It is already
  # provider-qualified (e.g. "zai-coding-plan/glm-5.2" or "gx10/ornith-llamacpp"),
  # so it is used verbatim -- only the legacy host-session sniff, which yields a
  # bare model id, needs a provider prefix.
  PIPELINE_MODEL="${GRAPH_MEMORY_WORKER_MODEL:-${OPENCODE_PIPELINE_MODEL:-}}"
  if [ -n "$PIPELINE_MODEL" ]; then
    echo "Using configured pipeline model: $PIPELINE_MODEL"
  else
    SNIFFED_MODEL=$(grep -o '"modelID"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOST_DATA"/storage/message/*/msg_*.json 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"' || true)
    if [ -n "$SNIFFED_MODEL" ]; then
      PIPELINE_MODEL="zai-coding-plan/$SNIFFED_MODEL"
      echo "Resolved model from host sessions: $PIPELINE_MODEL"
    else
      echo "Warning: could not resolve a pipeline model. Container will use opencode defaults."
    fi
  fi

  # Container-safe config, written fresh rather than copying the host's config
  # directory: custom provider definitions carry over (a local model endpoint is
  # defined there), while host-path MCP servers, plugins, and anything else in
  # that directory stay on the host.
  CONTAINER_CONFIG="$(mktemp)"
  trap 'rm -f "$CONTAINER_CONFIG"' EXIT
  if ! HOST_CONFIG_FILE="$HOST_CONFIG_FILE" PIPELINE_MODEL="$PIPELINE_MODEL" node -e '
    const fs = require("fs");
    const out = { "$schema": "https://opencode.ai/config.json" };
    if (process.env.PIPELINE_MODEL) out.model = process.env.PIPELINE_MODEL;
    const src = process.env.HOST_CONFIG_FILE;
    if (src) {
      try {
        const raw = fs.readFileSync(src, "utf-8").replace(/,(\s*[}\]])/g, "$1");
        const cfg = JSON.parse(raw);
        if (cfg.provider) out.provider = cfg.provider;
        if (cfg.small_model) out.small_model = cfg.small_model;
      } catch (err) {
        console.error("  Warning: could not carry over host provider config: " + err.message);
      }
    }
    process.stdout.write(JSON.stringify(out, null, 2));
  ' > "$CONTAINER_CONFIG"; then
    echo "Warning: failed to build container opencode config."
  else
    docker exec "$GRAPH_MEMORY_DOCKER_CONTAINER" mkdir -p "$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config/opencode"
    docker cp "$CONTAINER_CONFIG" "$GRAPH_MEMORY_DOCKER_CONTAINER:$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.config/opencode/opencode.json"
    echo "Wrote container-safe opencode config${PIPELINE_MODEL:+ with model: $PIPELINE_MODEL}"
    IMPORTED=true
  fi
fi

if [ "$IMPORTED" = false ]; then
  echo "No opencode auth or config found on the host."
  echo "Checked: $HOST_DATA/auth.json, $HOST_CONFIG/opencode.json"
  echo "Run 'opencode providers' on the host to configure a provider first."
  exit 1
fi

echo "opencode auth imported into container."
echo

"$DIR/bin/docker-opencode-auth-status.sh"
