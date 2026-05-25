// Scenario: init creates storage directories
// Given:  quorum project at ~/.claude/mcp-servers/quorum
// When:   ensureStorageDirs is called with the default storage dir
// Then:   ledger/, consolidated/, quarantine/, archive/ all contain a .keep file

import { ensureStorageDirs } from "../../../../src/paths.ts";
import { DEFAULT_CONFIG } from "../../../../src/config.ts";
import { expandHome } from "../../../../src/paths.ts";
import { existsSync } from "fs";
import path from "path";

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

const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
await ensureStorageDirs(storageDir);

const subdirs = ["ledger", "consolidated", "quarantine", "archive"];
for (const sub of subdirs) {
  const keepPath = path.join(storageDir, sub, ".keep");
  assert(`${sub}/.keep exists`, existsSync(keepPath), keepPath);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
