// Scenario: learn_contradict and learn_verify work after consolidate archives the obs
// Given: a domain where an obs has been shouted and then archived by consolidate
// When: contradict (or verify) is called with the original obs_id
// Then: both handlers resolve the obs from the archive JSONL (not active ledger) and succeed
//
// This is the retest after the archive-aware fix in commit f5d2673.
// Prior to the fix both handlers returned {error:"obs_id not found in ledger"} once
// the active ledger was rolled into the archive by consolidate.
//
// Design note: contradict and verify run in separate sub-domains to prevent the
// hash-only similarity engine from clustering the two test observations together
// (Jaccard >= 0.3 is easily triggered by shared vocabulary). Clustering would cause
// only one consolidated entry to be created, and contradict removing it would leave
// verify with nothing in consolidated to update.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { handler as shout } from "../../../../src/tools/shout.ts";
import { handler as consolidate } from "../../../../src/tools/consolidate.ts";
import { handler as contradict } from "../../../../src/tools/contradict.ts";
import { handler as verify } from "../../../../src/tools/verify.ts";

const BASE_DOMAIN = `archive-aware-retest-${Date.now()}`;
const CONTRADICT_DOMAIN = `${BASE_DOMAIN}-ctd`;
const VERIFY_DOMAIN = `${BASE_DOMAIN}-vfy`;
const STORAGE_DIR = path.join(homedir(), ".claude", "mcp-servers", "quorum", "data");

let contradictObsId: string;
let verifyObsId: string;

async function cleanupDomain(domain: string) {
  const files = [
    path.join(STORAGE_DIR, "ledger", `${domain}.jsonl`),
    path.join(STORAGE_DIR, "consolidated", `${domain}.json`),
    path.join(STORAGE_DIR, "quarantine", `${domain}.json`),
    path.join(STORAGE_DIR, `${domain}.state.json`),
  ];
  for (const f of files) await fs.unlink(f).catch(() => {});
  const archiveDir = path.join(STORAGE_DIR, "archive");
  const entries = await fs.readdir(archiveDir).catch(() => [] as string[]);
  for (const e of entries) {
    if (e.startsWith(domain + "_") || e.startsWith(domain + ".")) {
      await fs.unlink(path.join(archiveDir, e)).catch(() => {});
    }
  }
}

// Helper: scan archive JSONL files for a domain and return all obs_ids found
async function archivedObsIds(domain: string): Promise<string[]> {
  const archiveDir = path.join(STORAGE_DIR, "archive");
  const ids: string[] = [];
  const entries = await fs.readdir(archiveDir).catch(() => [] as string[]);
  for (const e of entries) {
    if (!e.startsWith(domain + "_")) continue;
    const content = await fs.readFile(path.join(archiveDir, e), "utf8");
    for (const line of content.split("\n").filter(Boolean)) {
      try {
        const obs = JSON.parse(line);
        if (obs.obs_id) ids.push(obs.obs_id);
      } catch {}
    }
  }
  return ids;
}

async function shoutConsolidateArchive(domain: string, claim: string, type: string): Promise<string> {
  const raw = await shout({
    domain,
    type,
    claim,
    evidence: `evidence for retest domain ${domain}`,
    agent_id: "retest-agent",
  });
  const obsId = JSON.parse(raw).obs_id;

  // Sleep so shout ts is strictly < consolidate's captured `now`.
  // archive.roll moves obs where obs.ts < beforeTs into archive JSONL.
  await Bun.sleep(20);
  await consolidate({ domain });

  // Guard: if not yet archived, flush once more
  const archived = await archivedObsIds(domain);
  if (!archived.includes(obsId)) {
    await Bun.sleep(10);
    await consolidate({ domain });
  }

  return obsId;
}

beforeAll(async () => {
  await cleanupDomain(CONTRADICT_DOMAIN);
  await cleanupDomain(VERIFY_DOMAIN);

  // Each domain gets a single unique obs — no clustering possible with only one obs.
  contradictObsId = await shoutConsolidateArchive(
    CONTRADICT_DOMAIN,
    "qzxhypothesis-contradict-retest-unique-claim-7f3k",
    "hypothesis",
  );
  verifyObsId = await shoutConsolidateArchive(
    VERIFY_DOMAIN,
    "qzxverified-api-retest-unique-claim-9m2p",
    "verified-api-endpoint",
  );
});

afterAll(async () => {
  await cleanupDomain(CONTRADICT_DOMAIN);
  await cleanupDomain(VERIFY_DOMAIN);
});

describe("archive-aware lookup — contradict after consolidate archives obs", () => {
  it("active ledger no longer contains the obs (confirms archive happened)", async () => {
    const ledgerFile = path.join(STORAGE_DIR, "ledger", `${CONTRADICT_DOMAIN}.jsonl`);
    const exists = await fs.access(ledgerFile).then(() => true).catch(() => false);
    if (exists) {
      const content = await fs.readFile(ledgerFile, "utf8");
      expect(content).not.toContain(contradictObsId);
    }
    // If ledger file doesn't exist, the archive is complete — pass
  });

  it("contradict returns quarantine_id when targeting an archived obs_id", async () => {
    const raw = await contradict({
      domain: CONTRADICT_DOMAIN,
      obs_id: contradictObsId,
      claim: "contradicting the original archived claim with definitive new evidence",
      evidence: "new evidence that supersedes archived observation",
      agent_id: "retest-agent-contradictor",
    });

    const parsed = JSON.parse(raw);

    // Must NOT return an error — archive-aware fix resolves obs from archive JSONL
    expect(parsed).not.toHaveProperty("error");

    // Must return a quarantine_id as UUID
    expect(parsed).toHaveProperty("quarantine_id");
    expect(typeof parsed.quarantine_id).toBe("string");
    expect(parsed.quarantine_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("quarantine file contains the pair created from the archived obs", async () => {
    const qPath = path.join(STORAGE_DIR, "quarantine", `${CONTRADICT_DOMAIN}.json`);
    const raw = await fs.readFile(qPath, "utf8");
    const pairs = raw.trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    const pair = pairs.find((p: any) => p.old_obs?.obs_id === contradictObsId);
    expect(pair).not.toBeUndefined();
    expect(pair).toHaveProperty("quarantine_id");
  });
});

describe("archive-aware lookup — verify after consolidate archives obs", () => {
  it("active ledger no longer contains the obs (confirms archive happened)", async () => {
    const ledgerFile = path.join(STORAGE_DIR, "ledger", `${VERIFY_DOMAIN}.jsonl`);
    const exists = await fs.access(ledgerFile).then(() => true).catch(() => false);
    if (exists) {
      const content = await fs.readFile(ledgerFile, "utf8");
      expect(content).not.toContain(verifyObsId);
    }
  });

  it("verify returns obs_id and new_ttl_expires_at when targeting an archived obs_id", async () => {
    const raw = await verify({
      domain: VERIFY_DOMAIN,
      obs_id: verifyObsId,
    });

    const parsed = JSON.parse(raw);

    // Must NOT return an error — archive-aware fix resolves obs type from archive JSONL
    expect(parsed).not.toHaveProperty("error");

    // Must echo back the same obs_id
    expect(parsed).toHaveProperty("obs_id");
    expect(parsed.obs_id).toBe(verifyObsId);

    // Must return a future TTL timestamp (number, greater than now)
    expect(parsed).toHaveProperty("new_ttl_expires_at");
    expect(typeof parsed.new_ttl_expires_at).toBe("number");
    expect(parsed.new_ttl_expires_at).toBeGreaterThan(Date.now());
  });

  it("consolidated entry ttl_expires_at is updated after verify", async () => {
    const cPath = path.join(STORAGE_DIR, "consolidated", `${VERIFY_DOMAIN}.json`);
    // consolidated file is a plain JSON array of ConsolidatedEntry, not {entries:[]}
    const entries = JSON.parse(await fs.readFile(cPath, "utf8")) as any[];
    const entry = entries.find((e) => e.obs_id === verifyObsId);
    expect(entry).not.toBeUndefined();
    expect(entry.ttl_expires_at).toBeGreaterThan(Date.now());
  });
});
