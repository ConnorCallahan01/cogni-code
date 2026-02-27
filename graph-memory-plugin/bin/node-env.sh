#!/bin/bash
# Shared helper: ensures node is on PATH for nvm/fnm/volta users.
# Source this from other wrapper scripts: source "$(dirname "$0")/node-env.sh"

if ! command -v node &>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  if ! command -v node &>/dev/null && command -v fnm &>/dev/null; then
    eval "$(fnm env)"
  fi

  if ! command -v node &>/dev/null; then
    export VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"
    [ -d "$VOLTA_HOME" ] && export PATH="$VOLTA_HOME/bin:$PATH"
  fi

  if ! command -v node &>/dev/null; then
    for p in /opt/homebrew/bin /usr/local/bin; do
      [ -x "$p/node" ] && export PATH="$p:$PATH" && break
    done
  fi
fi
