// Scenario: state.write + state.read round-trip (atomic write)
// Given:  a fresh domain state
// When:   write() stores the state, read() reads it back
// Then:   all fields are preserved exactly; read on missing domain returns defaults

import * as domainState from "../../../../src/storage/state.ts";
import type { DomainState } from "../../../../src/types.ts";
import { statePath, expandHome } from "../../../../src/paths.ts";
import { DEFAULT_CONFIG } from "../../../../src/config.ts";
import { existsSync, unlinkSync } from "fs";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

const testDomain = `test-state-${Date.now()}`;
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
const sPath = statePath(storageDir, testDomain);

if (existsSync(sPath)) unlinkSync(sPath);

// read on missing domain: must return defaults, not throw
let threwOnMissing = false;
let defaultResult: DomainState | null = null;
try {
  defaultResult = await domainState.read(testDomain);
} catch {
  threwOnMissing = true;
}
assert("read on missing domain does not throw", !threwOnMissing);
assert("read on missing domain returns name field", defaultResult?.name === testDomain);
assert("read on missing domain returns ledger_count=0", defaultResult?.ledger_count === 0);
assert("read on missing domain returns consolidated_count=0", defaultResult?.consolidated_count === 0);

const state: DomainState = {
  name: testDomain,
  ledger_count: 42,
  consolidated_count: 10,
  quarantine_count: 3,
  last_consolidated_ts: Date.now(),
  content_hash: "abc123deadbeef",
};

await domainState.write(testDomain, state);

assert("state file exists after write", existsSync(sPath));

// The file must be valid JSON (atomic write succeeded)
const rawText = await Bun.file(sPath).text();
let parsedOk = false;
try {
  JSON.parse(rawText);
  parsedOk = true;
} catch {
  parsedOk = false;
}
assert("state file on disk is valid JSON", parsedOk);

const readBack = await domainState.read(testDomain);
assert("name round-trips", readBack.name === state.name);
assert("ledger_count round-trips", readBack.ledger_count === state.ledger_count);
assert("consolidated_count round-trips", readBack.consolidated_count === state.consolidated_count);
assert("quarantine_count round-trips", readBack.quarantine_count === state.quarantine_count);
assert("last_consolidated_ts round-trips", readBack.last_consolidated_ts === state.last_consolidated_ts);
assert("content_hash round-trips", readBack.content_hash === state.content_hash);

// Cleanup
if (existsSync(sPath)) unlinkSync(sPath);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
