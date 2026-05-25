#!/usr/bin/env bash
# Run all UAT tests: CLI (no server) + HTTP API (with server)
set -euo pipefail

QUORUM_DIR="/Users/macbook/.claude/mcp-servers/quorum"
VARS_FILE="$QUORUM_DIR/tests/uat/local.vars"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== CLI Smoke Tests ==="
bash "$QUORUM_DIR/tests/uat/cli/subcommands/cli-smoke.sh"
CLI_EXIT=$?

echo ""
echo "=== HTTP API + Dashboard Tests ==="
echo "Starting server..."
cd "$QUORUM_DIR" && bun src/server.ts &
SERVER_PID=$!
sleep 2

hurl \
  --variables-file "$VARS_FILE" \
  --test \
  "$QUORUM_DIR/tests/uat/http-api/rest-endpoints/"*.hurl \
  "$QUORUM_DIR/tests/uat/dashboard/frontend/"*.hurl \
  --continue-on-error \
  --color
HURL_EXIT=$?

echo ""
if [ "$CLI_EXIT" -eq 0 ] && [ "$HURL_EXIT" -eq 0 ]; then
  echo "STATUS: GREEN"
else
  echo "STATUS: FAILURES FOUND"
  exit 1
fi
