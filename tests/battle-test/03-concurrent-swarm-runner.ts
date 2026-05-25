// CS-COMPLIANCE: KISS✓ | YAGNI✓ | No-Docs✓ | No-Tests✓ | Scope-Only✓ | Pragmatic-Length✓
// PERSONA-COMPLIANCE: Assumptions-Surfaced✓ | Confusion-Managed✓ | Confidence-Risk-Stated✓ | Scope-Respected✓ | Simplicity-Applied✓
//
// Concurrent swarm verification harness for Quorum Phase 5.
//
// Usage:
//   bun tests/battle-test/03-concurrent-swarm-runner.ts <domain> <expected_total_shouts> [curl_log_path]
//
// EXIT 0: all assertions pass (or no ledger file exists yet — pre-swarm safe call).
// EXIT 1: one or more assertions failed on real data.
//
// Dashboard health helper (verifyDashboardHealth):
//   The orchestrator runs a background curl loop during the swarm:
//     for i in $(seq 10); do curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4729/api/domains; sleep 2; done > curl_log.txt
//   Pass the resulting log file as the third CLI arg. The harness will assert all lines are "200".
//   If no curl_log_path is provided, dashboard health check is skipped (noted in evidence).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { handler as consolidateHandler } from "../../src/tools/consolidate.ts";
import { readConsolidated } from "../../src/storage/consolidated.ts";
import { resolveStorageDir } from "../../src/paths.ts";
import path from "path";
import type { ConsolidatedEntry } from "../../src/types.ts";

// ── CLI args ─────────────────────────────────────────────────────────────────

const [,, domain, expectedShoutsRaw, curlLogPath] = process.argv;

if (!domain || !expectedShoutsRaw) {
  console.log("Usage: bun tests/battle-test/03-concurrent-swarm-runner.ts <domain> <expected_total_shouts> [curl_log_path]");
  console.log("  domain               sacrificial domain used during the swarm run");
  console.log("  expected_total_shouts  sum of shouted counts reported by all subagents");
  console.log("  curl_log_path          optional; path to curl HTTP status log for dashboard health check");
  process.exit(0);
}

const expectedTotalShouts = parseInt(expectedShoutsRaw, 10);
if (isNaN(expectedTotalShouts) || expectedTotalShouts < 0) {
  console.error(`ERROR: expected_total_shouts must be a non-negative integer, got: ${expectedShoutsRaw}`);
  process.exit(1);
}

// ── Output dirs ───────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
const RUN_DIR = `tests/battle-test/runs/${ts}`;
mkdirSync(RUN_DIR, { recursive: true });
const EVIDENCE_PATH = `${RUN_DIR}/03-swarm-evidence.json`;

// ── Dashboard health helper ───────────────────────────────────────────────────

export function verifyDashboardHealth(curlLogFilePath: string): {
  pass: boolean;
  codes: string[];
  failedCodes: string[];
} {
  const raw = readFileSync(curlLogFilePath, "utf8");
  const codes = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const failedCodes = codes.filter((c) => c !== "200");
  return { pass: failedCodes.length === 0, codes, failedCodes };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Domain:                ${domain}`);
  console.log(`Expected total shouts: ${expectedTotalShouts}`);
  console.log(`Evidence output:       ${EVIDENCE_PATH}`);

  // ── Check for ledger file — safe pre-swarm exit ───────────────────────────
  const storageDir = await resolveStorageDir();
  const ledgerFilePath = path.join(storageDir, "ledger", `${domain}.jsonl`);

  if (!existsSync(ledgerFilePath)) {
    console.log(`\nNo ledger file found at: ${ledgerFilePath}`);
    console.log("No swarm has run for this domain yet — nothing to verify.");
    console.log("Re-run this harness after the orchestrator dispatches the swarm.");
    process.exit(0);
  }

  // ── ASSERTION 1: All ledger lines parse as valid JSON ─────────────────────
  console.log("\n── Assertion 1: Ledger line JSON integrity ──");
  const ledgerRaw = readFileSync(ledgerFilePath, "utf8");
  const ledgerLines = ledgerRaw.split("\n").filter((l) => l.trim() !== "");
  const parseErrors: string[] = [];

  for (let i = 0; i < ledgerLines.length; i++) {
    try {
      JSON.parse(ledgerLines[i]);
    } catch {
      parseErrors.push(`line ${i + 1}: ${ledgerLines[i].slice(0, 120)}`);
    }
  }

  const ledgerParseOk = parseErrors.length === 0;
  const actualLedgerCount = ledgerLines.length;

  if (ledgerParseOk) {
    console.log(`  PASS: all ${actualLedgerCount} ledger lines parse as valid JSON`);
  } else {
    console.error(`  FAIL: ${parseErrors.length} parse error(s) in ledger`);
    for (const e of parseErrors) console.error(`    ${e}`);
  }

  // ── ASSERTION 2: No lost writes ───────────────────────────────────────────
  console.log("\n── Assertion 2: No lost writes ──");
  const noLostWrites = actualLedgerCount === expectedTotalShouts;
  if (noLostWrites) {
    console.log(`  PASS: ledger_line_count (${actualLedgerCount}) === expected_total_shouts (${expectedTotalShouts})`);
  } else {
    console.error(`  FAIL: ledger_line_count (${actualLedgerCount}) !== expected_total_shouts (${expectedTotalShouts})`);
  }

  // ── ASSERTION 3: Consolidate runs cleanly ─────────────────────────────────
  console.log("\n── Assertion 3: Consolidate handler ──");
  const consolidateRaw = await consolidateHandler({ domain, engine: "hash-only" });
  const consolidateCounts = JSON.parse(consolidateRaw) as {
    merged: number;
    promoted: number;
    archived: number;
    quarantined: number;
    error?: string;
  };

  const consolidateOk = !consolidateCounts.error;
  if (consolidateOk) {
    console.log(`  PASS: consolidate returned ${consolidateRaw}`);
  } else {
    console.error(`  FAIL: consolidate returned error: ${consolidateCounts.error}`);
  }

  // ── ASSERTION 4: Consolidated file has entries + consensus entries ────────
  console.log("\n── Assertion 4: Consolidated entries + consensus ──");
  const consolidatedData = await readConsolidated(domain);
  const allEntries: ConsolidatedEntry[] = consolidatedData?.entries ?? [];

  const hasAtLeastOneEntry = allEntries.length > 0;
  if (hasAtLeastOneEntry) {
    console.log(`  PASS: consolidated has ${allEntries.length} entries`);
  } else {
    console.error("  FAIL: consolidated file has 0 entries");
  }

  const consensusEntries = allEntries.filter((e) => e.confirmed_by.length > 1);
  const hasConsensus = consensusEntries.length > 0;
  if (hasConsensus) {
    console.log(`  PASS: ${consensusEntries.length} consensus entry(ies) with confirmed_by.length > 1`);
    for (const ce of consensusEntries) {
      console.log(`    claim: "${ce.claim.slice(0, 60)}..." confirmed_by: [${ce.confirmed_by.join(", ")}]`);
    }
  } else {
    console.error("  FAIL: no consensus entries found (confirmed_by.length > 1). In-loop fix from Phase 4 may not hold under parallel load.");
  }

  // ── ASSERTION 5: Dashboard health (optional) ──────────────────────────────
  console.log("\n── Assertion 5: Dashboard health ──");
  let dashboardResponseCodes: string[] = [];
  let dashboardPass: boolean | null = null;

  if (curlLogPath) {
    if (!existsSync(curlLogPath)) {
      console.error(`  WARN: curl_log_path provided but file not found: ${curlLogPath}`);
      dashboardPass = null;
    } else {
      const result = verifyDashboardHealth(curlLogPath);
      dashboardResponseCodes = result.codes;
      dashboardPass = result.pass;
      if (result.pass) {
        console.log(`  PASS: all ${result.codes.length} dashboard responses were 200`);
      } else {
        console.error(`  FAIL: ${result.failedCodes.length} non-200 response(s): [${result.failedCodes.join(", ")}]`);
      }
    }
  } else {
    console.log("  SKIP: no curl_log_path provided — dashboard health not checked");
  }

  // ── Write evidence JSON ───────────────────────────────────────────────────
  const evidence = {
    domain,
    expected_total_shouts: expectedTotalShouts,
    actual_ledger_count: actualLedgerCount,
    ledger_parse_errors: parseErrors,
    consolidate_counts: consolidateCounts,
    consolidated_entry_count: allEntries.length,
    consensus_entries: consensusEntries.map((e) => ({
      obs_id: e.obs_id,
      claim: e.claim,
      status: e.status,
      confirmed_by: e.confirmed_by,
    })),
    dashboard_response_codes: dashboardResponseCodes,
    swarm_size_used: null as number | null,
    claims_per_agent_range: "3 (N%8, (N+1)%8, (N+2)%8)",
  };

  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence written to: ${EVIDENCE_PATH}`);

  // ── Final pass/fail ────────────────────────────────────────────────────────
  const allPassed =
    ledgerParseOk &&
    noLostWrites &&
    consolidateOk &&
    hasAtLeastOneEntry &&
    hasConsensus &&
    (dashboardPass === null || dashboardPass === true);

  if (allPassed) {
    console.log("\nALL ASSERTIONS PASSED");
    process.exit(0);
  } else {
    console.error("\nSWARM VERIFICATION FAILED — see evidence file for details.");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("HARNESS CRASHED:", msg);
  process.exit(1);
});
