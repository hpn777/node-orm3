#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.test.yml}
PROJECT_NAME=${COMPOSE_PROJECT_NAME:-orm3-test}
SKIP_DOCKER_CLEANUP=${SKIP_DOCKER_CLEANUP:-0}

cleanup() {
  if [[ "$SKIP_DOCKER_CLEANUP" != "1" ]]; then
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# Ensure a clean slate before starting
cleanup

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up --build --abort-on-container-exit --exit-code-from test-runner "$@"
