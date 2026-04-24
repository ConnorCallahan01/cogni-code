#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
eval "$("$DIR/bin/runtime-env.sh")"

echo "== Runtime config =="
"$DIR/bin/runtime-env.sh"
echo

echo "== Container state =="
"$DIR/bin/docker-status.sh" || true
echo

echo "== Healthcheck =="
if "$DIR/bin/docker-healthcheck.sh" >/dev/null 2>&1; then
  echo "healthy"
else
  echo "unhealthy"
fi
echo

echo "== Codex auth status =="
"$DIR/bin/docker-codex-auth-status.sh" || true
