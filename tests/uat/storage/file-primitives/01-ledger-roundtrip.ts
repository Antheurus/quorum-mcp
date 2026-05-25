// Scenario: ledger append + readLedgerSince round-trip
// Given:  a fresh test domain (unique name to avoid collision)
// When:   appendObservation writes an entry, readLedgerSince(domain, 0) reads it back
// Then:   returned array contains the original observation with all fields intact

import { appendObservation, readLedgerSince } from "../../../../src/storage/ledger.ts";
import type { Observation } from "../../../../src/types.ts";
import { ledgerPath, expandHome } from "../../../../src/paths.ts";
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

const testDomain = `test-ledger-roundtrip-${Date.now()}`;
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
const lPath = ledgerPath(storageDir, testDomain);

// Cleanup on start in case of prior run
if (existsSync(lPath)) unlinkSync(lPath);

const obs: Observation = {
  obs_id: "obs-test-001",
  domain: testDomain,
  type: "gotcha",
  claim: "HttpOnly cookies are invisible to client-side JS",
  evidence: "browser security spec",
  refs: ["MDN"],
  agent_id: "agent-smoke-tester",
  ts: Date.now(),
  contradicts: null,
};

await appendObservation(testDomain, obs);

const results = await readLedgerSince(testDomain, 0);

assert("readLedgerSince returns at least 1 entry", results.length >= 1);

const found = results.find((r) => r.obs_id === obs.obs_id);
assert("obs_id round-trips correctly", found?.obs_id === obs.obs_id);
assert("domain round-trips correctly", found?.domain === obs.domain);
assert("type round-trips correctly", found?.type === obs.type);
assert("claim round-trips correctly", found?.claim === obs.claim);
assert("evidence round-trips correctly", found?.evidence === obs.evidence);
assert("agent_id round-trips correctly", found?.agent_id === obs.agent_id);
assert("ts round-trips correctly", found?.ts === obs.ts);
assert("contradicts round-trips as null", found?.contradicts === null);
assert("refs round-trips as array", Array.isArray(found?.refs) && found?.refs[0] === "MDN");

// Test marker filtering — entries with ts <= marker should be excluded
const newerMarker = obs.ts + 1;
const filteredResults = await readLedgerSince(testDomain, newerMarker);
assert("readLedgerSince(marker > ts) returns empty", filteredResults.length === 0,
  `got ${filteredResults.length} entries when marker=${newerMarker} > ts=${obs.ts}`);

// Test append-only: second write should stack
const obs2: Observation = { ...obs, obs_id: "obs-test-002", ts: obs.ts + 100 };
await appendObservation(testDomain, obs2);
const allResults = await readLedgerSince(testDomain, 0);
assert("two appends produce two entries", allResults.length === 2, `got ${allResults.length}`);

// Cleanup
if (existsSync(lPath)) unlinkSync(lPath);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
