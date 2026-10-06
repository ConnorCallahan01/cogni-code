#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

HOST_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
HOST_AUTH_JSON="$HOST_CODEX_HOME/auth.json"
HOST_CONFIG_TOML="$HOST_CODEX_HOME/config.toml"
CONTAINER_CODEX_HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH/.codex"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI is not installed on the host."
  exit 1
fi

if ! codex login status >/dev/null 2>&1; then
  echo "Host Codex login is not ready. Run 'codex login' on the host first."
  exit 1
fi

if [ ! -f "$HOST_AUTH_JSON" ]; then
  echo "Host Codex auth file not found at $HOST_AUTH_JSON"
  exit 1
fi

# A ChatGPT login carries a refresh token that OpenAI rotates on every refresh.
# Copied into the container, it is one token held in two places: whichever side
# refreshes first revokes the other's copy, and from then on every codex worker
# fails on a 401 while `codex login status` still says "Logged in". API-key
# logins have no refresh token and are safe to copy.
HAS_REFRESH_TOKEN=$(node -e '
  try {
    const auth = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
    process.stdout.write(auth.tokens && auth.tokens.refresh_token ? "yes" : "no");
  } catch {
    process.stdout.write("unknown");
  }
' "$HOST_AUTH_JSON")

if [ "$HAS_REFRESH_TOKEN" != "no" ] && [ "${GRAPH_MEMORY_ALLOW_SHARED_CODEX_AUTH:-}" != "1" ]; then
  echo "Host Codex is signed in with ChatGPT, and that login can't be shared with the container:"
  echo "its refresh token rotates, so the first side to refresh signs the other out."
  echo
  echo "Give the container its own login instead:"
  echo "  $DIR/bin/docker-codex-login.sh"
  echo "  OPENAI_API_KEY=... $DIR/bin/docker-codex-login-api-key.sh"
  echo
  echo "To copy it anyway, rerun with GRAPH_MEMORY_ALLOW_SHARED_CODEX_AUTH=1."
  exit 1
fi

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'mkdir -p "$HOME/.codex" && chmod 700 "$HOME" "$HOME/.codex"'

docker cp "$HOST_AUTH_JSON" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER:$CONTAINER_CODEX_HOME/auth.json"

if [ -f "$HOST_CONFIG_TOML" ]; then
  docker cp "$HOST_CONFIG_TOML" \
    "$GRAPH_MEMORY_DOCKER_CONTAINER:$CONTAINER_CODEX_HOME/config.toml"
fi

docker exec \
  -e HOME="$GRAPH_MEMORY_CONTAINER_AUTH_PATH" \
  "$GRAPH_MEMORY_DOCKER_CONTAINER" \
  bash -lc 'chmod 700 "$HOME" "$HOME/.codex" && chmod 600 "$HOME/.codex/auth.json" && if [ -f "$HOME/.codex/config.toml" ]; then chmod 600 "$HOME/.codex/config.toml"; fi'

"$DIR/bin/docker-codex-auth-status.sh"
