// Scenario: ENGINE_NAMES contains all 8 expected engine names; getEngine factory works
// Given:  the engine registry and getEngine factory
// When:   ENGINE_NAMES is inspected; getEngine("hash-only", config) is called
// Then:   all 8 names present; factory returns a usable SimilarityEngine

import { ENGINE_NAMES, getEngine } from "../../../../src/similarity/engine.ts";
import { DEFAULT_CONFIG } from "../../../../src/config.ts";

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

// All 8 engine names must be registered
const EXPECTED_NAMES = [
  "hash-only",
  "claude-haiku",
  "claude-sonnet",
  "openai-embed",
  "gemini",
  "deepseek",
  "minimax",
  "local-minilm",
];

assert("ENGINE_NAMES has exactly 8 entries", ENGINE_NAMES.length === 8,
  `got ${ENGINE_NAMES.length}: ${ENGINE_NAMES.join(", ")}`);

for (const name of EXPECTED_NAMES) {
  assert(`ENGINE_NAMES contains "${name}"`,
    (ENGINE_NAMES as readonly string[]).includes(name));
}

// getEngine("hash-only") must return a usable engine without any API key
const engine = await getEngine("hash-only", DEFAULT_CONFIG);
assert("getEngine(hash-only) returns object with name", engine.name === "hash-only");
assert("getEngine(hash-only) returns object with available()", typeof engine.available === "function");
assert("getEngine(hash-only) returns object with cluster()", typeof engine.cluster === "function");
assert("getEngine(hash-only) available() returns true", await engine.available() === true);

// getEngine with unknown engine must throw (not return undefined)
let unknownThrew = false;
try {
  await getEngine("totally-unknown-engine", DEFAULT_CONFIG);
} catch {
  unknownThrew = true;
}
assert("getEngine(unknown) throws an error", unknownThrew);

// getEngine for stub engines (deepseek, minimax, local-minilm) returns available()=false
for (const stubName of ["deepseek", "minimax", "local-minilm"]) {
  const stub = await getEngine(stubName, DEFAULT_CONFIG);
  assert(`getEngine(${stubName}).available() returns false`, await stub.available() === false);
}

// getEngine for API-key engines without keys must return available()=false (not throw)
const configNoKeys = {
  ...DEFAULT_CONFIG,
  similarity: {
    ...DEFAULT_CONFIG.similarity,
    api_keys: { anthropic: null, openai: null, gemini: null, deepseek: null, minimax: null },
  },
};

for (const apiEngine of ["claude-haiku", "claude-sonnet", "openai-embed", "gemini"]) {
  const eng = await getEngine(apiEngine, configNoKeys);
  const avail = await eng.available();
  assert(`getEngine(${apiEngine}) without key: available()=false`, avail === false,
    `got: ${avail}`);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
