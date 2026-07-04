#!/bin/bash
# Ensures the resolved container engine (docker or podman, from
# GRAPH_MEMORY_CONTAINER_ENGINE — set by runtime-env.sh) is actually
# reachable before creating/starting a container. Source this after
# runtime-env.sh in scripts that create containers. Not sourced by
# read-only scripts (status/healthcheck/doctor) — they already degrade
# gracefully when the engine is unreachable.
#
# podman doesn't auto-start its VM the way Docker Desktop does, so this
# starts it on demand rather than requiring the user to remember to.

if [ -z "${GRAPH_MEMORY_CONTAINER_ENGINE:-}" ]; then
  echo "Neither docker nor podman is installed or on PATH."
  exit 1
fi

if [ "$GRAPH_MEMORY_CONTAINER_ENGINE" = "podman" ]; then
  MACHINE_STATE="$(podman machine list --format '{{.Running}}' 2>/dev/null | head -1)"
  if [ "$MACHINE_STATE" != "true" ]; then
    echo "Starting podman machine..."
    podman machine start || {
      echo "Failed to start podman machine."
      exit 1
    }
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "$GRAPH_MEMORY_CONTAINER_ENGINE daemon is not running or not reachable."
  exit 1
fi
