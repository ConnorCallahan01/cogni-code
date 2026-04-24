#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/bin/node-env.sh"
exec node "$DIR/dist/hooks/on-pre-tool-use.js"
