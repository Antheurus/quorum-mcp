#!/usr/bin/env bash
# CLI smoke tests — no server required
# Tests: --help, status, unknown-cmd, init (idempotent)

QUORUM_DIR="/Users/macbook/.claude/mcp-servers/quorum"
BIN="$QUORUM_DIR/bin/quorum.ts"
PASS=0
FAIL=0

run_test() {
  local name="$1"
  local expected_exit="$2"
  local expected_output_pattern="$3"
  shift 3
  local actual_output
  actual_output=$(cd "$QUORUM_DIR" && bun "$BIN" "$@" 2>&1)
  local actual_exit=$?

  local output_ok=0
  if [ -z "$expected_output_pattern" ]; then
    output_ok=1
  elif echo "$actual_output" | grep -q "$expected_output_pattern"; then
    output_ok=1
  fi

  if [ "$actual_exit" -eq "$expected_exit" ] && [ "$output_ok" -eq 1 ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name"
    echo "        exit: got=$actual_exit expected=$expected_exit"
    if [ "$output_ok" -eq 0 ]; then
      echo "        output pattern '$expected_output_pattern' not found"
      echo "        actual: $actual_output"
    fi
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "CLI Smoke Tests"
echo "---------------"

# Invariant 8: --help exits 0 and contains "init"
run_test "--help exits 0 and mentions init" 0 "init" "--help"

# Invariant 9: status exits 0 (may show empty table)
run_test "status exits 0" 0 "" "status"

# Invariant 10: unknown-cmd exits 1
run_test "unknown-cmd exits 1" 1 "Unknown command" "unknown-cmd"

# Invariant 11: init is idempotent (dirs already exist, config already exists)
# Pipe "n" to skip the settings.json prompt so it does not block
INIT_OUTPUT=$(cd "$QUORUM_DIR" && echo "n" | bun "$BIN" init 2>&1)
INIT_EXIT=$?
if [ "$INIT_EXIT" -eq 0 ]; then
  echo "  PASS  init idempotent (exit 0, dirs already exist)"
  PASS=$((PASS + 1))
else
  echo "  FAIL  init idempotent"
  echo "        exit: got=$INIT_EXIT expected=0"
  echo "        output: $INIT_OUTPUT"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed / $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
