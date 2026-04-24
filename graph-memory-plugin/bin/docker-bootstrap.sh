#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

if [ "$GRAPH_MEMORY_RUNTIME_MODE" != "docker" ]; then
  echo "Runtime mode is $GRAPH_MEMORY_RUNTIME_MODE, not docker. Configure docker mode first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running or not reachable."
  exit 1
fi

echo "Building and starting graph-memory daemon container..."
"$DIR/bin/docker-start.sh"

echo "Waiting for container runtime to become healthy..."
attempt=0
until "$DIR/bin/docker-healthcheck.sh" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    echo "Container healthcheck did not pass in time."
    "$DIR/bin/docker-status.sh" || true
    exit 1
  fi
  sleep 2
done

echo "Container healthcheck passed."
echo

if ! "$DIR/bin/docker-codex-auth-status.sh" >/dev/null 2>&1; then
  if command -v codex >/dev/null 2>&1 && codex login status >/dev/null 2>&1; then
    echo "Host Codex auth detected. Importing it into the container..."
    if "$DIR/bin/docker-codex-import-host-auth.sh" >/dev/null 2>&1; then
      echo "Imported host Codex auth into the container."
      echo
    else
      echo "Host Codex auth import failed."
      echo
    fi
  fi
fi

echo "Current Codex auth state inside the container:"
"$DIR/bin/docker-codex-auth-status.sh" || true
echo
echo "If Codex is already authenticated on the host, you can import it with:"
echo "  $DIR/bin/docker-codex-import-host-auth.sh"
echo
echo "If Codex is not authenticated yet, run:"
echo "  $DIR/bin/docker-codex-login.sh"
echo
echo "If you prefer API key auth, export OPENAI_API_KEY and run:"
echo "  $DIR/bin/docker-codex-login-api-key.sh"
