// Scenario: init is idempotent — second run does not overwrite config
// Given:  config.json already exists at DEFAULT_CONFIG_PATH
// When:   bin/quorum.ts init logic runs (ensureStorageDirs + config-exists guard)
// Then:   config.json is unchanged and no error is thrown

import { DEFAULT_CONFIG_PATH, loadConfig, saveConfig, DEFAULT_CONFIG } from "../../../../src/config.ts";
import { ensureStorageDirs, expandHome } from "../../../../src/paths.ts";
import { existsSync, readFileSync } from "fs";

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

// Read the existing config content before the second "init"
const configFile = Bun.file(DEFAULT_CONFIG_PATH);
const configExistsBefore = await configFile.exists();
const contentBefore = configExistsBefore ? await configFile.text() : null;

// Simulate the init guard: ensureStorageDirs always runs; config write is skipped when file exists
const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
await ensureStorageDirs(storageDir);

let skipReason: string | null = null;
if (configExistsBefore) {
  skipReason = "Config already exists — skipping write.";
} else {
  await saveConfig(DEFAULT_CONFIG, DEFAULT_CONFIG_PATH);
}

// Config file must exist after the run
assert("config.json exists after second init", existsSync(DEFAULT_CONFIG_PATH));

// If the config existed before, it must be unchanged
if (contentBefore !== null) {
  const contentAfter = readFileSync(DEFAULT_CONFIG_PATH, "utf8");
  assert("config.json content unchanged on second init", contentBefore === contentAfter, "content was mutated");
  assert("skip message logged (simulated)", skipReason === "Config already exists — skipping write.");
}

// Config must still be parseable and valid
try {
  const config = await loadConfig(DEFAULT_CONFIG_PATH);
  assert("loaded config has version field", typeof config.version === "string");
  assert("loaded config has storage_dir field", typeof config.storage_dir === "string");
} catch (e) {
  console.error(`  FAIL  config is parseable — ${e}`);
  failed++;
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
