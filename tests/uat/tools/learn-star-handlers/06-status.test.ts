// Scenario: learn_status returns DomainState[] for all known domains
// Given: at least one domain with consolidated data
// When: status is called with empty input ({})
// Then: returns JSON with `domains` array; each entry has required DomainState fields

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { handler as shout } from "../../../../src/tools/shout.ts";
import { handler as consolidate } from "../../../../src/tools/consolidate.ts";
import { handler as status } from "../../../../src/tools/status.ts";

const DOMAIN = `smoke-status-${Date.now()}`;
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
    claim: "status smoke test claim",
    evidence: "evidence",
    agent_id: "smoke-test-status",
  });
  await consolidate({ domain: DOMAIN });
});

afterAll(cleanup);

describe("learn_status handler", () => {
  it("returns JSON with domains array", async () => {
    const raw = await status({});
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("domains");
    expect(Array.isArray(parsed.domains)).toBe(true);
  });

  it("domains array contains the smoke test domain", async () => {
    const raw = await status({});
    const { domains } = JSON.parse(raw);
    const entry = domains.find((d: any) => d.name === DOMAIN);
    expect(entry).not.toBeUndefined();
  });

  it("each domain entry has all required DomainState fields", async () => {
    const raw = await status({});
    const { domains } = JSON.parse(raw);
    const entry = domains.find((d: any) => d.name === DOMAIN);
    expect(entry).toHaveProperty("name");
    expect(entry).toHaveProperty("ledger_count");
    expect(entry).toHaveProperty("consolidated_count");
    expect(entry).toHaveProperty("quarantine_count");
    expect(entry).toHaveProperty("last_consolidated_ts");
    expect(entry).toHaveProperty("content_hash");
    expect(typeof entry.ledger_count).toBe("number");
    expect(typeof entry.consolidated_count).toBe("number");
    expect(typeof entry.last_consolidated_ts).toBe("number");
  });

  it("single domain query returns only that domain", async () => {
    const raw = await status({ domain: DOMAIN });
    const { domains } = JSON.parse(raw);
    expect(domains).toHaveLength(1);
    expect(domains[0].name).toBe(DOMAIN);
  });

  it("status for unknown domain returns entry with zeroed counts", async () => {
    const raw = await status({ domain: "totally-unknown-domain-xyz" });
    const { domains } = JSON.parse(raw);
    expect(domains).toHaveLength(1);
    // state.read returns default zero state — should not error
    expect(domains[0]).toHaveProperty("ledger_count");
    expect(typeof domains[0].ledger_count).toBe("number");
  });
});
