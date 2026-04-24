#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"

node "$DIR/dist/graph-memory/external-inputs-cli.js" "$@"
