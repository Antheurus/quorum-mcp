// Scenario: config zod schema rejects negative TTL values
// Given:  a config object with a negative TTL integer
// When:   ConfigSchema.parse() is called
// Then:   it throws a ZodError (not silently passes)

import { loadConfig } from "../../../../src/config.ts";
import { z } from "zod";
import path from "path";
import { homedir } from "os";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";

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

// Write a temp config with negative TTL and attempt to load it
const badConfig = {
  version: "0.1.0",
  storage_dir: path.join(homedir(), ".claude", "mcp-servers", "quorum", "data"),
  dashboard: { port: 4729 },
  similarity: {
    engine: "hash-only",
    api_keys: { anthropic: null, openai: null, gemini: null, deepseek: null, minimax: null },
    claude_model: "claude-haiku-4-5-20251001",
  },
  ttl_defaults: {
    "verified-api-endpoint": -1,   // INVALID: negative
    "verified-static-behavior": 365,
    "verified-workflow": 60,
    gotcha: 90,
    "failure-mode": 180,
    hypothesis: 14,
  },
  consolidation: { min_consensus_count: 2 },
  domains: {},
};

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "quorum-test-"));
const tmpConfigPath = path.join(tmpDir, "bad-config.json");
writeFileSync(tmpConfigPath, JSON.stringify(badConfig, null, 2));

let threw = false;
let errorIsZod = false;
try {
  await loadConfig(tmpConfigPath);
} catch (e) {
  threw = true;
  errorIsZod = e instanceof z.ZodError;
}

assert("loadConfig throws on negative TTL", threw);
assert("error is ZodError (not generic Error)", errorIsZod);

// Also verify zero is rejected (positiveInt = strictly positive)
const zeroConfig = { ...badConfig, ttl_defaults: { ...badConfig.ttl_defaults, "verified-api-endpoint": 0 } };
writeFileSync(tmpConfigPath, JSON.stringify(zeroConfig, null, 2));

let threwZero = false;
try {
  await loadConfig(tmpConfigPath);
} catch {
  threwZero = true;
}
assert("loadConfig throws on zero TTL (positiveInt requires > 0)", threwZero);

// Valid config must NOT throw
const validConfig = { ...badConfig, ttl_defaults: { ...badConfig.ttl_defaults, "verified-api-endpoint": 30 } };
writeFileSync(tmpConfigPath, JSON.stringify(validConfig, null, 2));

let threwValid = false;
try {
  await loadConfig(tmpConfigPath);
} catch (e) {
  threwValid = true;
  console.error("  Unexpected error on valid config:", e);
}
assert("valid config does NOT throw", !threwValid);

// Cleanup
rmSync(tmpDir, { recursive: true });

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
