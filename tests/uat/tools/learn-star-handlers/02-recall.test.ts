// Scenario: learn_recall returns version header + consolidated content
// Given: a domain with at least one shout + consolidate run
// When: recall is called
// Then: returned string starts with <!-- quorum | domain=... | content_hash= version header

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { handler as shout } from "../../../../src/tools/shout.ts";
import { handler as consolidate } from "../../../../src/tools/consolidate.ts";
import { handler as recall } from "../../../../src/tools/recall.ts";

const DOMAIN = `smoke-recall-${Date.now()}`;
const STORAGE_DIR = path.join(homedir(), ".claude", "mcp-servers", "quorum", "data");

async function cleanup() {
  const files = [
    path.join(STORAGE_DIR, "ledger", `${DOMAIN}.jsonl`),
    path.join(STORAGE_DIR, "consolidated", `${DOMAIN}.json`),
    path.join(STORAGE_DIR, "quarantine", `${DOMAIN}.json`),
    path.join(STORAGE_DIR, `${DOMAIN}.state.json`),
  ];
  for (const f of files) await fs.unlink(f).catch(() => {});
  // archive cleanup
  const archiveDir = path.join(STORAGE_DIR, "archive");
  const entries = await fs.readdir(archiveDir).catch(() => []);
  for (const e of entries) {
    if (e.startsWith(DOMAIN)) await fs.unlink(path.join(archiveDir, e)).catch(() => {});
  }
}

beforeAll(async () => {
  await cleanup();
  // Seed two observations so consolidate has something to promote
  await shout({
    domain: DOMAIN,
    type: "hypothesis",
    claim: "recall test claim alpha",
    evidence: "evidence alpha",
    agent_id: "smoke-test-recall",
  });
  await shout({
    domain: DOMAIN,
    type: "gotcha",
    claim: "recall test claim beta",
    evidence: "evidence beta",
    agent_id: "smoke-test-recall",
  });
  // Run consolidate so consolidated file exists
  await consolidate({ domain: DOMAIN });
});

afterAll(cleanup);

describe("learn_recall handler", () => {
  it("returned string starts with version header containing domain name", async () => {
    const result = await recall({ domain: DOMAIN });
    expect(result).toMatch(/^<!-- quorum \| domain=/);
    expect(result).toContain(`domain=${DOMAIN}`);
  });

  it("version header contains content_hash field", async () => {
    const result = await recall({ domain: DOMAIN });
    expect(result).toMatch(/content_hash=/);
  });

  it("version header contains recall_ts field", async () => {
    const result = await recall({ domain: DOMAIN });
    expect(result).toMatch(/recall_ts=/);
  });

  it("returns no-data message for unknown domain", async () => {
    const result = await recall({ domain: "domain-that-does-not-exist-xyz" });
    // Should still start with header, then say no consolidated knowledge
    expect(result).toMatch(/^<!-- quorum \| domain=/);
    expect(result).toContain("no consolidated knowledge");
  });

  it("hint filters to relevant chunks", async () => {
    const resultAll = await recall({ domain: DOMAIN });
    const resultHinted = await recall({ domain: DOMAIN, hint: "alpha" });
    // Both should start with header
    expect(resultAll).toMatch(/^<!-- quorum \| domain=/);
    expect(resultHinted).toMatch(/^<!-- quorum \| domain=/);
    // Hinted result has alpha claim visible
    expect(resultHinted).toContain("alpha");
  });
});
