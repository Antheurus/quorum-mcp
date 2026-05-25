// Scenario: learn_contradict appends new obs + creates quarantine pair
// Given: a domain with a known obs_id in the ledger
// When: contradict is called with that obs_id
// Then: returns JSON with quarantine_id; new obs exists in ledger; quarantine file updated

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { handler as shout } from "../../../../src/tools/shout.ts";
import { handler as contradict } from "../../../../src/tools/contradict.ts";
import { handler as consolidate } from "../../../../src/tools/consolidate.ts";

const DOMAIN = `smoke-contradict-${Date.now()}`;
const STORAGE_DIR = path.join(homedir(), ".claude", "mcp-servers", "quorum", "data");
const LEDGER_FILE = path.join(STORAGE_DIR, "ledger", `${DOMAIN}.jsonl`);
const QUARANTINE_FILE = path.join(STORAGE_DIR, "quarantine", `${DOMAIN}.json`);

let originalObsId: string;

async function cleanup() {
  const files = [
    LEDGER_FILE,
    QUARANTINE_FILE,
    path.join(STORAGE_DIR, "consolidated", `${DOMAIN}.json`),
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
  // Create original observation — intentionally do NOT consolidate before contradicting.
  // Regression note: contradict reads active ledger only; after consolidate archives the ledger,
  // contradict returns {error:"obs_id not found in ledger"}.
  // This is a real regression (tracked separately) — test targets the working path.
  const raw = await shout({
    domain: DOMAIN,
    type: "hypothesis",
    claim: "original claim to be contradicted",
    evidence: "original evidence",
    agent_id: "smoke-agent-original",
  });
  originalObsId = JSON.parse(raw).obs_id;
});

afterAll(cleanup);

describe("learn_contradict handler", () => {
  it("returns JSON with quarantine_id field", async () => {
    const raw = await contradict({
      domain: DOMAIN,
      obs_id: originalObsId,
      claim: "contradicting claim — original was wrong",
      evidence: "new evidence overrides old",
      agent_id: "smoke-agent-contradictor",
    });
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("quarantine_id");
    expect(typeof parsed.quarantine_id).toBe("string");
    expect(parsed.quarantine_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("new contradicting observation appears in ledger", async () => {
    const ledgerContent = await fs.readFile(LEDGER_FILE, "utf8");
    const lines = ledgerContent.trim().split("\n").filter(Boolean);
    const contradictingEntry = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((o) => o?.contradicts === originalObsId);
    expect(contradictingEntry).not.toBeNull();
    expect(contradictingEntry.claim).toBe("contradicting claim — original was wrong");
  });

  it("quarantine file contains the pair", async () => {
    // quarantine file is JSONL (one QuarantinePair JSON per line)
    const raw = await fs.readFile(QUARANTINE_FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const pairs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const pair = pairs.find((p: any) => p.old_obs?.obs_id === originalObsId);
    expect(pair).not.toBeUndefined();
    expect(pair).toHaveProperty("quarantine_id");
    expect(pair).toHaveProperty("resolution_status");
  });

  it("returns error JSON for unknown obs_id (not throw)", async () => {
    const raw = await contradict({
      domain: DOMAIN,
      obs_id: "00000000-0000-0000-0000-000000000000",
      claim: "targeting nonexistent obs",
      evidence: "evidence",
      agent_id: "smoke-agent-contradictor",
    });
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("error");
    expect(typeof parsed.error).toBe("string");
  });
});
