// Scenario: hash-only.cluster groups identical/similar claims and separates distinct ones
// Given:  ["foo bar", "foo bar", "baz qux"] (first two identical, third distinct)
// When:   cluster() is called
// Then:   indices 0 and 1 appear in the same inner array, index 2 in a separate array

import { HashOnlyEngine } from "../../../../src/similarity/hash-only.ts";

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

const engine = new HashOnlyEngine();

// Test 1: basic grouping
const claims = ["foo bar", "foo bar", "baz qux"];
const result = await engine.cluster(claims);

assert("cluster returns array", Array.isArray(result));
assert("cluster returns 2 groups", result.length === 2,
  `got ${result.length} groups: ${JSON.stringify(result)}`);

// Find the group containing index 0
const groupWith0 = result.find((g) => g.includes(0));
assert("index 0 and 1 are in the same group", groupWith0?.includes(1) === true,
  `groups: ${JSON.stringify(result)}`);

// Index 2 must be in a different group
const groupWith2 = result.find((g) => g.includes(2));
assert("index 2 is in its own group", groupWith2 !== groupWith0,
  `groups: ${JSON.stringify(result)}`);

// All indices accounted for
const allIndices = result.flat().sort((a, b) => a - b);
assert("all 3 indices present in result", JSON.stringify(allIndices) === JSON.stringify([0, 1, 2]));

// Test 2: empty input
const emptyResult = await engine.cluster([]);
assert("empty input returns []", Array.isArray(emptyResult) && emptyResult.length === 0);

// Test 3: single claim
const singleResult = await engine.cluster(["lone claim"]);
assert("single claim returns [[0]]", JSON.stringify(singleResult) === "[[0]]",
  `got ${JSON.stringify(singleResult)}`);

// Test 4: all identical claims
const allSame = await engine.cluster(["same", "same", "same"]);
assert("all identical claims go into 1 group", allSame.length === 1,
  `got ${allSame.length} groups`);

// Test 5: available() returns true for hash-only (no API key needed)
const avail = await engine.available();
assert("hash-only.available() returns true", avail === true);

// Test 6: estimateCost mentions no API calls
const cost = engine.estimateCost(10);
assert("estimateCost returns a string", typeof cost === "string");
assert("estimateCost mentions $0", cost.includes("$0"), `got: ${cost}`);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
