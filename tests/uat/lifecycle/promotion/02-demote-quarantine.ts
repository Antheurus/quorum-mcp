// Scenario: demote() returns a QuarantinePair with resolution_status="pending"
// Given:  two observations (old + contradicting new)
// When:   demote(obsA, obsB, now, quarantineId) is called
// Then:   returns QuarantinePair with resolution_status="pending" and correct fields

import { demote } from "../../../../src/lifecycle/promote.ts";
import type { Observation, QuarantinePair } from "../../../../src/types.ts";

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

const now = Date.now();
const quarantineId = "qid-smoke-test-001";

const obsA: Observation = {
  obs_id: "obs-demote-old",
  domain: "test-lifecycle",
  type: "gotcha",
  claim: "Original claim about cookies",
  evidence: "spec 2024",
  refs: ["https://example.com/spec"],
  agent_id: "agent-alpha",
  ts: now - 5000,
  contradicts: null,
};

const obsB: Observation = {
  obs_id: "obs-demote-new",
  domain: "test-lifecycle",
  type: "gotcha",
  claim: "Contradicting claim about cookies",
  evidence: "spec 2025",
  refs: [],
  agent_id: "agent-beta",
  ts: now,
  contradicts: "obs-demote-old",
};

const pair: QuarantinePair = demote(obsA, obsB, now, quarantineId);

// Shape checks
assert("demote returns an object", typeof pair === "object" && pair !== null);
assert("quarantine_id matches param", pair.quarantine_id === quarantineId);
assert("old_obs is obsA", pair.old_obs.obs_id === obsA.obs_id);
assert("new_obs is obsB", pair.new_obs.obs_id === obsB.obs_id);
assert("created_at matches now param", pair.created_at === now,
  `expected ${now}, got ${pair.created_at}`);
assert("resolution_status is 'pending'", pair.resolution_status === "pending",
  `got: ${pair.resolution_status}`);

// Verify it is not "resolved_old" or "resolved_new" at construction time
assert("resolution_status is NOT resolved_old", pair.resolution_status !== "resolved_old");
assert("resolution_status is NOT resolved_new", pair.resolution_status !== "resolved_new");

// Verify old_obs fields preserved
assert("old_obs.claim preserved", pair.old_obs.claim === obsA.claim);
assert("old_obs.agent_id preserved", pair.old_obs.agent_id === obsA.agent_id);
assert("old_obs.ts preserved", pair.old_obs.ts === obsA.ts);

// Verify new_obs fields preserved
assert("new_obs.claim preserved", pair.new_obs.claim === obsB.claim);
assert("new_obs.agent_id preserved", pair.new_obs.agent_id === obsB.agent_id);
assert("new_obs.contradicts preserved", pair.new_obs.contradicts === "obs-demote-old");

// Purity: different now param changes created_at
const pastNow = now - 99_999;
const pair2 = demote(obsA, obsB, pastNow, "qid-002");
assert("demote is pure: different now param → different created_at",
  pair2.created_at === pastNow,
  `expected ${pastNow}, got ${pair2.created_at}`);

// Purity: different quarantineId flows through correctly
const pair3 = demote(obsA, obsB, now, "qid-distinct-xyz");
assert("demote is pure: quarantine_id matches distinct param",
  pair3.quarantine_id === "qid-distinct-xyz");

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
