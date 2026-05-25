// Scenario: stub engines return false from available() and throw with engine name in message
// Given:  stub engines for deepseek, minimax, local-minilm
// When:   available() is called → must return false (not throw)
//         cluster() is called → must throw with engine name in the error message
// Then:   invariants hold for all 3 stub names

import { makeStub } from "../../../../src/similarity/stubs.ts";

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

const stubNames = ["deepseek", "minimax", "local-minilm"] as const;

for (const name of stubNames) {
  const engine = makeStub(name);

  // name property
  assert(`${name}: engine.name === "${name}"`, engine.name === name,
    `got: ${engine.name}`);

  // available() must return false (not throw)
  let availThrew = false;
  let availResult: boolean | null = null;
  try {
    availResult = await engine.available();
  } catch {
    availThrew = true;
  }
  assert(`${name}: available() does not throw`, !availThrew);
  assert(`${name}: available() returns false`, availResult === false, `got: ${availResult}`);

  // cluster() must throw with engine name in the message
  let clusterThrew = false;
  let clusterError: Error | null = null;
  try {
    await engine.cluster(["some claim"]);
  } catch (e) {
    clusterThrew = true;
    clusterError = e as Error;
  }
  assert(`${name}: cluster() throws`, clusterThrew);
  assert(`${name}: cluster() error message contains engine name`,
    clusterError?.message?.includes(name) === true,
    `message: ${clusterError?.message}`);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
