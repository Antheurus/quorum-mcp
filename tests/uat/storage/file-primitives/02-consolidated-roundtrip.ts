// Scenario: writeConsolidated + readConsolidated round-trip with stable hash
// Given:  a fresh test domain
// When:   writeConsolidated writes entries, readConsolidated reads them back
// Then:   entries are stored as JSON (not markdown), hash is stable for identical input
//         and readConsolidated on a missing domain returns null (not throws)

import { writeConsolidated, readConsolidated } from "../../../../src/storage/consolidated.ts";
import type { ConsolidatedEntry } from "../../../../src/types.ts";
import { consolidatedPath, expandHome } from "../../../../src/paths.ts";
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

const testDomain = `test-consolidated-${Date.now()}`;
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
const cPath = consolidatedPath(storageDir, testDomain);

// Cleanup on start
if (existsSync(cPath)) unlinkSync(cPath);

// Test: missing domain returns null (not throws)
let threwOnMissing = false;
let missingResult: unknown = "sentinel";
try {
  missingResult = await readConsolidated(`nonexistent-domain-${Date.now()}`);
} catch {
  threwOnMissing = true;
}
assert("readConsolidated on missing domain does not throw", !threwOnMissing);
assert("readConsolidated on missing domain returns null", missingResult === null);

const now = Date.now();
const entries: ConsolidatedEntry[] = [
  {
    obs_id: "obs-c-001",
    status: "verified",
    claim: "Bun.password.hash is built in",
    evidence_refs: ["MDN", "Bun docs"],
    confirmed_by: ["agent-a", "agent-b"],
    ttl_expires_at: now + 86_400_000 * 30,
    last_verified_at: now,
  },
  {
    obs_id: "obs-c-002",
    status: "hypothesis",
    claim: "onConflictDoUpdate beats onConflictDoNothing",
    evidence_refs: [],
    confirmed_by: ["agent-a"],
    ttl_expires_at: now + 86_400_000 * 14,
    last_verified_at: now,
  },
];

const hash1 = await writeConsolidated(testDomain, entries);

assert("writeConsolidated returns a non-empty string hash", typeof hash1 === "string" && hash1.length > 0);

// Verify the file on disk is valid JSON (not markdown)
const rawFile = await Bun.file(cPath).text();
let parsedFromDisk: ConsolidatedEntry[] | null = null;
let diskParseOk = false;
try {
  parsedFromDisk = JSON.parse(rawFile) as ConsolidatedEntry[];
  diskParseOk = true;
} catch {
  diskParseOk = false;
}
assert("consolidated file on disk is valid JSON", diskParseOk);
assert("disk content is an array", Array.isArray(parsedFromDisk));
assert("disk content has 2 entries", parsedFromDisk?.length === 2);

// readConsolidated round-trip
const result = await readConsolidated(testDomain);
assert("readConsolidated returns non-null result", result !== null);
assert("readConsolidated entries is array", Array.isArray(result?.entries));
assert("readConsolidated returns 2 entries", result?.entries.length === 2);

// Verify both obs_ids are present
const obsIds = result?.entries.map((e) => e.obs_id) ?? [];
assert("obs-c-001 is in returned entries", obsIds.includes("obs-c-001"));
assert("obs-c-002 is in returned entries", obsIds.includes("obs-c-002"));

// Hash stability: writing the same entries again must produce the same hash
const hash2 = await writeConsolidated(testDomain, entries);
assert("hash is stable for identical input (write 1 == write 2)", hash1 === hash2,
  `hash1=${hash1} hash2=${hash2}`);

// Hash from readConsolidated must match hash from writeConsolidated
const resultAfterRewrite = await readConsolidated(testDomain);
assert("hash from readConsolidated matches hash from writeConsolidated",
  resultAfterRewrite?.hash === hash2,
  `read=${resultAfterRewrite?.hash} write=${hash2}`);

// Verify status field is preserved as a string (not coerced)
const entry1 = result?.entries.find((e) => e.obs_id === "obs-c-001");
assert("status 'verified' round-trips as string", entry1?.status === "verified");

// Cleanup
if (existsSync(cPath)) unlinkSync(cPath);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
