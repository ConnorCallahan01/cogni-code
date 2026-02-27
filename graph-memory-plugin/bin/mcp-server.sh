#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"
exec node "$DIR/dist/graph-memory/mcp-server.js"
