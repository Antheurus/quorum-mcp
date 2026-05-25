// Scenario: promote() returns verified for 2+ distinct agents, hypothesis for same agent
// Given:  clusters with varying agent_id combinations; no existing entries
// When:   promote(cluster, [], now) is called
// Then:
//   - 2 distinct agent_ids → status=verified
//   - 2 same agent_ids    → status=hypothesis
//   - 1 agent only        → status=hypothesis

import { promote } from "../../../../src/lifecycle/promote.ts";
import type { Observation, ConsolidatedEntry } from "../../../../src/types.ts";

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

function makeObs(id: string, agentId: string, type = "gotcha"): Observation {
  return {
    obs_id: id,
    domain: "test-domain",
    type,
    claim: `Claim ${id}`,
    evidence: "test",
    refs: [],
    agent_id: agentId,
    ts: now - 1000,
    contradicts: null,
  };
}

// Case 1: 2 distinct agents → verified
const clusterDistinct = [makeObs("obs-a", "agent-a"), makeObs("obs-b", "agent-b")];
const resultDistinct = promote(clusterDistinct, [], now);
assert("2 distinct agents → status=verified", resultDistinct.status === "verified",
  `got: ${resultDistinct.status}`);
assert("2 distinct agents → confirmed_by has 2 entries", resultDistinct.confirmed_by.length === 2);
assert("confirmed_by includes agent-a", resultDistinct.confirmed_by.includes("agent-a"));
assert("confirmed_by includes agent-b", resultDistinct.confirmed_by.includes("agent-b"));
assert("ttl_expires_at is a positive number > now", resultDistinct.ttl_expires_at > now);

// Case 2: 2 observations from the SAME agent → hypothesis (not verified)
const clusterSameAgent = [makeObs("obs-c", "agent-a"), makeObs("obs-d", "agent-a")];
const resultSameAgent = promote(clusterSameAgent, [], now);
assert("same agent twice → status=hypothesis", resultSameAgent.status === "hypothesis",
  `got: ${resultSameAgent.status}`);
assert("same agent: confirmed_by has 1 unique entry (deduped)", resultSameAgent.confirmed_by.length === 1,
  `got: ${resultSameAgent.confirmed_by}`);

// Case 3: single agent in cluster → hypothesis
const clusterSingle = [makeObs("obs-e", "agent-x")];
const resultSingle = promote(clusterSingle, [], now);
assert("single agent → status=hypothesis", resultSingle.status === "hypothesis",
  `got: ${resultSingle.status}`);
assert("single agent: confirmed_by has 1 entry", resultSingle.confirmed_by.length === 1);

// Case 4: existing entry with 1 agent + new observation from SAME obs_id, different agent → verified
// The existing entry must share an obs_id with the cluster for the merge to trigger.
// Lookup: clusterObsIds.has(e.obs_id) — so existingEntry.obs_id must be in the cluster.
const existingEntry: ConsolidatedEntry = {
  obs_id: "obs-f",   // matches the cluster obs_id below
  status: "hypothesis",
  claim: "prior claim",
  evidence_refs: [],
  confirmed_by: ["agent-prior"],
  ttl_expires_at: now + 86_400_000,
  last_verified_at: now - 1000,
};

const clusterNewAgent = [makeObs("obs-f", "agent-new")]; // obs_id "obs-f" matches existingEntry
const resultMerged = promote(clusterNewAgent, [existingEntry], now);
// After merge: ["agent-prior", "agent-new"] = 2 distinct → verified
assert("merged prior+new distinct agents → verified (obs_id match)", resultMerged.status === "verified",
  `got: ${resultMerged.status}, confirmed_by: ${resultMerged.confirmed_by}`);
assert("merged confirmed_by has 2 entries", resultMerged.confirmed_by.length === 2);

// Also verify: existing entry whose agent overlaps with cluster agent gets merged
const existingOverlapAgent: ConsolidatedEntry = {
  obs_id: "obs-z",
  status: "hypothesis",
  claim: "another prior",
  evidence_refs: [],
  confirmed_by: ["agent-new"], // "agent-new" is also in the cluster → overlap match
  ttl_expires_at: now + 86_400_000,
  last_verified_at: now - 1000,
};
const clusterNewAgent2 = [makeObs("obs-g", "agent-new"), makeObs("obs-h", "agent-extra")];
const resultOverlap = promote(clusterNewAgent2, [existingOverlapAgent], now);
assert("merged via agent overlap → confirmed_by deduped", resultOverlap.confirmed_by.length >= 2);

// Case 5: promote is pure — now param drives TTL (not internal Date.now())
const pastNow = now - 10_000;
const resultPast = promote([makeObs("obs-g", "agent-a"), makeObs("obs-h", "agent-b")], [], pastNow);
// TTL for "gotcha" is 90 days from pastNow
const expectedExpiry = pastNow + 90 * 86_400_000;
assert("ttl_expires_at derived from now param (pure function)",
  resultPast.ttl_expires_at === expectedExpiry,
  `expected ${expectedExpiry}, got ${resultPast.ttl_expires_at}`);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
