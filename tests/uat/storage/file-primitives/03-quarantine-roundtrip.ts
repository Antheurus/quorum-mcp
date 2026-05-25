// Scenario: quarantine add + list + resolve round-trip
// Given:  a fresh test domain
// When:   a QuarantinePair is added, listed, then resolved
// Then:   list returns the pair; resolve overwrites resolution_status via append

import * as quarantine from "../../../../src/storage/quarantine.ts";
import type { QuarantinePair, Observation } from "../../../../src/types.ts";
import { quarantinePath, expandHome } from "../../../../src/paths.ts";
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

const testDomain = `test-quarantine-${Date.now()}`;
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
const qPath = quarantinePath(storageDir, testDomain);

if (existsSync(qPath)) unlinkSync(qPath);

const now = Date.now();

const baseObs: Observation = {
  obs_id: "obs-q-old",
  domain: testDomain,
  type: "gotcha",
  claim: "Old claim about HttpOnly cookies",
  evidence: "spec",
  refs: [],
  agent_id: "agent-a",
  ts: now - 1000,
  contradicts: null,
};

const newObs: Observation = {
  obs_id: "obs-q-new",
  domain: testDomain,
  type: "gotcha",
  claim: "New contradicting claim about HttpOnly cookies",
  evidence: "updated spec",
  refs: [],
  agent_id: "agent-b",
  ts: now,
  contradicts: "obs-q-old",
};

const pair: QuarantinePair = {
  quarantine_id: "q-test-uuid-001",
  old_obs: baseObs,
  new_obs: newObs,
  created_at: now,
  resolution_status: "pending",
};

await quarantine.add(pair);

// list should return the pair
const listed = await quarantine.list(testDomain);
assert("list returns 1 entry after add", listed.length === 1, `got ${listed.length}`);
assert("quarantine_id round-trips", listed[0]?.quarantine_id === pair.quarantine_id);
assert("resolution_status starts as pending", listed[0]?.resolution_status === "pending");
assert("old_obs.obs_id round-trips", listed[0]?.old_obs.obs_id === "obs-q-old");
assert("new_obs.obs_id round-trips", listed[0]?.new_obs.obs_id === "obs-q-new");

// Resolve it
await quarantine.resolve(testDomain, "q-test-uuid-001", "resolved_new");

// list after resolve: last-write-wins via append, so resolution_status should be updated
const afterResolve = await quarantine.list(testDomain);
assert("list still returns 1 entry after resolve (last-wins)", afterResolve.length === 1);
assert("resolution_status updated to resolved_new", afterResolve[0]?.resolution_status === "resolved_new",
  `got: ${afterResolve[0]?.resolution_status}`);

// list on missing domain returns empty array (no throw)
let threwOnMissing = false;
let missingList: QuarantinePair[] = [];
try {
  missingList = await quarantine.list(`nonexistent-domain-${Date.now()}`);
} catch {
  threwOnMissing = true;
}
assert("quarantine.list on missing domain does not throw", !threwOnMissing);
assert("quarantine.list on missing domain returns []", missingList.length === 0);

// Cleanup
if (existsSync(qPath)) unlinkSync(qPath);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
