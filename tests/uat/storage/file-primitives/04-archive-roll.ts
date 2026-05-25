// Scenario: archive roll moves old ledger entries to monthly archive file
// Given:  a ledger with 2 old observations and 1 new observation
// When:   roll(domain, cutoffTs) is called
// Then:   old entries move to archive file, new entry stays in ledger, count returned

import { appendObservation, readLedgerSince } from "../../../../src/storage/ledger.ts";
import { roll } from "../../../../src/storage/archive.ts";
import type { Observation } from "../../../../src/types.ts";
import { ledgerPath, archivePath, expandHome } from "../../../../src/paths.ts";
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

const testDomain = `test-archive-${Date.now()}`;
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
const lPath = ledgerPath(storageDir, testDomain);

if (existsSync(lPath)) unlinkSync(lPath);

const oldTs = Date.now() - 90_000; // 90s ago
const newTs = Date.now();

const makeObs = (id: string, ts: number): Observation => ({
  obs_id: id,
  domain: testDomain,
  type: "gotcha",
  claim: `Claim ${id}`,
  evidence: "test",
  refs: [],
  agent_id: "agent-test",
  ts,
  contradicts: null,
});

await appendObservation(testDomain, makeObs("obs-old-1", oldTs));
await appendObservation(testDomain, makeObs("obs-old-2", oldTs + 1000));
await appendObservation(testDomain, makeObs("obs-new-1", newTs));

const cutoff = newTs - 1; // everything older than this gets archived
const archivedCount = await roll(testDomain, cutoff);

assert("roll returns count of archived entries", archivedCount === 2, `got ${archivedCount}`);

// Remaining ledger should only have the new entry
const remaining = await readLedgerSince(testDomain, 0);
assert("ledger has 1 remaining entry after roll", remaining.length === 1, `got ${remaining.length}`);
assert("remaining entry is the new one", remaining[0]?.obs_id === "obs-new-1");

// Archive file should exist and contain the 2 old entries
const d = new Date(oldTs);
const yyyy = d.getFullYear();
const mm = String(d.getMonth() + 1).padStart(2, "0");
const suffix = `${yyyy}-${mm}`;
const aPath = archivePath(storageDir, testDomain, suffix);
assert("archive file exists", existsSync(aPath), aPath);

const archiveText = await Bun.file(aPath).text();
const archiveLines = archiveText.split("\n").filter((l) => l.trim() !== "");
assert("archive file has 2 lines", archiveLines.length === 2, `got ${archiveLines.length}`);

// Cleanup
if (existsSync(lPath)) unlinkSync(lPath);
if (existsSync(aPath)) unlinkSync(aPath);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
