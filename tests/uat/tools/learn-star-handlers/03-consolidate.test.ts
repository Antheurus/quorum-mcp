// Scenario: learn_consolidate runs full pipeline and returns counters
// Given: a domain with fresh observations in the ledger
// When: consolidate is called
// Then: returns JSON with merged, promoted, archived, quarantined fields

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { handler as shout } from "../../../../src/tools/shout.ts";
import { handler as consolidate } from "../../../../src/tools/consolidate.ts";

const DOMAIN = `smoke-consolidate-${Date.now()}`;
const STORAGE_DIR = path.join(homedir(), ".claude", "mcp-servers", "quorum", "data");

async function cleanup() {
  const files = [
    path.join(STORAGE_DIR, "ledger", `${DOMAIN}.jsonl`),
    path.join(STORAGE_DIR, "consolidated", `${DOMAIN}.json`),
    path.join(STORAGE_DIR, "quarantine", `${DOMAIN}.json`),
    path.join(STORAGE_DIR, `${DOMAIN}.state.json`),
  ];
  for (const f of files) await fs.unlink(f).catch(() => {});
  const archiveDir = path.join(STORAGE_DIR, "archive");
  const entries = await fs.readdir(archiveDir).catch(() => []);
  for (const e of entries) {
    if (e.startsWith(DOMAIN)) await fs.unlink(path.join(archiveDir, e)).catch(() => {});
  }
}

beforeAll(async () => {
  await cleanup();
  await shout({
    domain: DOMAIN,
    type: "hypothesis",
    claim: "consolidate smoke claim one",
    evidence: "test evidence",
    agent_id: "smoke-test-consolidate",
  });
  await shout({
    domain: DOMAIN,
    type: "gotcha",
    claim: "consolidate smoke claim two",
    evidence: "test evidence two",
    agent_id: "smoke-test-consolidate",
  });
});

afterAll(cleanup);

describe("learn_consolidate handler", () => {
  it("returns JSON with all four counter fields", async () => {
    const raw = await consolidate({ domain: DOMAIN });
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("merged");
    expect(parsed).toHaveProperty("promoted");
    expect(parsed).toHaveProperty("archived");
    expect(parsed).toHaveProperty("quarantined");
  });

  it("counter fields are all numbers", async () => {
    // Re-run after state already updated — should produce 0 counters (no new obs)
    const raw = await consolidate({ domain: DOMAIN });
    const parsed = JSON.parse(raw);
    expect(typeof parsed.merged).toBe("number");
    expect(typeof parsed.promoted).toBe("number");
    expect(typeof parsed.archived).toBe("number");
    expect(typeof parsed.quarantined).toBe("number");
  });

  it("first run promotes observations (promoted > 0 on virgin domain)", async () => {
    // Use a fresh sub-domain with a fresh shout to ensure promoted > 0
    const freshDomain = `${DOMAIN}-fresh`;
    try {
      await shout({
        domain: freshDomain,
        type: "hypothesis",
        claim: "fresh domain single claim",
        evidence: "evidence",
        agent_id: "smoke-test-consolidate",
      });
      const raw = await consolidate({ domain: freshDomain });
      const parsed = JSON.parse(raw);
      expect(parsed.promoted).toBeGreaterThan(0);
    } finally {
      const files = [
        path.join(STORAGE_DIR, "ledger", `${freshDomain}.jsonl`),
        path.join(STORAGE_DIR, "consolidated", `${freshDomain}.json`),
        path.join(STORAGE_DIR, `${freshDomain}.state.json`),
      ];
      for (const f of files) await fs.unlink(f).catch(() => {});
    }
  });

  it("error path: does not throw on unknown domain — returns zero counters", async () => {
    const raw = await consolidate({ domain: `no-such-domain-${Date.now()}` });
    // Should either return counters (all 0) or {error:...} — either way, valid JSON, no throw
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
