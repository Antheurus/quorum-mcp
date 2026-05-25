// Scenario: computeTtlExpiry and isExpired work correctly for all type keys
// Given:  known TTL defaults (gotcha=90d, hypothesis=14d, verified-api-endpoint=30d, etc.)
// When:   computeTtlExpiry(type, ts) is called; isExpired(entry, now) is checked
// Then:   expiry = ts + days*86400000; isExpired returns true when now > ttl_expires_at

import { computeTtlExpiry, isExpired } from "../../../../src/lifecycle/ttl.ts";
import type { ConsolidatedEntry } from "../../../../src/types.ts";

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

const MS_PER_DAY = 86_400_000;
const baseTs = 1_700_000_000_000; // fixed reference timestamp

// Check all known TTL type defaults
const expectedDays: Record<string, number> = {
  "verified-api-endpoint": 30,
  "verified-static-behavior": 365,
  "verified-workflow": 60,
  gotcha: 90,
  "failure-mode": 180,
  hypothesis: 14,
};

for (const [type, days] of Object.entries(expectedDays)) {
  const expiry = computeTtlExpiry(type, baseTs);
  const expected = baseTs + days * MS_PER_DAY;
  assert(`computeTtlExpiry("${type}") = ts + ${days}d`,
    expiry === expected,
    `expected ${expected}, got ${expiry}`);
}

// Unknown type falls back to 14 days (hypothesis default)
const unknownExpiry = computeTtlExpiry("totally-unknown-type", baseTs);
assert("unknown type defaults to 14d TTL",
  unknownExpiry === baseTs + 14 * MS_PER_DAY,
  `got ${unknownExpiry}`);

// Override parameter: caller can pass custom days map
const customExpiry = computeTtlExpiry("gotcha", baseTs, { gotcha: 7 });
assert("override map: gotcha → 7d when overridden",
  customExpiry === baseTs + 7 * MS_PER_DAY,
  `expected ${baseTs + 7 * MS_PER_DAY}, got ${customExpiry}`);

// isExpired: now > ttl_expires_at → true
const expiredEntry: ConsolidatedEntry = {
  obs_id: "obs-ttl-expired",
  status: "verified",
  claim: "old claim",
  evidence_refs: [],
  confirmed_by: ["agent-a"],
  ttl_expires_at: baseTs + 10,
  last_verified_at: baseTs,
};
assert("isExpired returns true when now > ttl_expires_at",
  isExpired(expiredEntry, baseTs + 11) === true);

// isExpired: now === ttl_expires_at → false (boundary: strictly greater)
assert("isExpired returns false when now === ttl_expires_at",
  isExpired(expiredEntry, baseTs + 10) === false);

// isExpired: now < ttl_expires_at → false
assert("isExpired returns false when now < ttl_expires_at",
  isExpired(expiredEntry, baseTs) === false);

// isExpired: far-future TTL not expired
const freshEntry: ConsolidatedEntry = {
  ...expiredEntry,
  obs_id: "obs-ttl-fresh",
  ttl_expires_at: Date.now() + 365 * MS_PER_DAY,
};
assert("isExpired returns false for far-future TTL", isExpired(freshEntry, Date.now()) === false);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
