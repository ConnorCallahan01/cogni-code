#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

if "$DIR/bin/docker-codex-auth-status.sh"; then
  exit 0
fi

echo
echo "If Codex is already authenticated on the host, you can import it with:"
echo "  $DIR/bin/docker-codex-import-host-auth.sh"
echo
echo "Codex auth is not ready inside the container."
echo "Run one of:"
echo "  $DIR/bin/docker-codex-import-host-auth.sh"
echo "  $DIR/bin/docker-codex-login.sh"
echo "  OPENAI_API_KEY=... $DIR/bin/docker-codex-login-api-key.sh"
exit 1
