import { z } from "zod";
import { readLedgerSince } from "../storage/ledger.ts";
import { readConsolidated, writeConsolidated } from "../storage/consolidated.ts";
import * as archive from "../storage/archive.ts";
import * as stateStore from "../storage/state.ts";
import * as quarantine from "../storage/quarantine.ts";
import { getEngine } from "../similarity/engine.ts";
import { promote, demote } from "../lifecycle/promote.ts";
import { loadConfig } from "../config.ts";
import type { Observation, ConsolidatedEntry } from "../types.ts";

export const name = "learn_consolidate";

export const schema = z.object({
  domain: z.string().describe("Knowledge domain to consolidate"),
  engine: z.string().optional().describe("Override similarity engine (e.g. hash-only, claude-haiku). Defaults to config engine."),
});

type ConsolidateInput = z.infer<typeof schema>;

export async function handler(input: ConsolidateInput): Promise<string> {
  try {
    const now = Date.now();
    const config = await loadConfig();
    const engineName = input.engine ?? config.similarity.engine;
    const state = await stateStore.read(input.domain);

    // Read new observations since last consolidation
    const newObs = await readLedgerSince(input.domain, state.last_consolidated_ts);

    // Separate contradictions from regular observations
    const contradictions = newObs.filter((o) => o.contradicts !== null);
    const regular = newObs.filter((o) => o.contradicts === null);

    // Get existing consolidated entries
    const existing = await readConsolidated(input.domain);
    const existingEntries: ConsolidatedEntry[] = existing?.entries ?? [];

    let merged = 0;
    let promoted = 0;
    let archived = 0;
    let quarantined = 0;

    const updatedEntries = [...existingEntries];

    if (regular.length > 0) {
      // Cluster claims using similarity engine
      const engine = await getEngine(engineName, config);
      const claims = regular.map((o) => o.claim);
      const clusters = await engine.cluster(claims);

      for (const clusterIndices of clusters) {
        const cluster: Observation[] = clusterIndices.map((i) => regular[i]);
        const result = promote(cluster, updatedEntries, now);

        // Build or update consolidated entry
        const primaryObs = cluster[0];
        const existingIdx = updatedEntries.findIndex((e) => e.obs_id === primaryObs.obs_id);

        const entry: ConsolidatedEntry = {
          obs_id: primaryObs.obs_id,
          status: result.status,
          claim: primaryObs.claim,
          evidence_refs: cluster.map((o) => o.obs_id),
          confirmed_by: result.confirmed_by,
          ttl_expires_at: result.ttl_expires_at,
          last_verified_at: now,
        };

        if (existingIdx >= 0) {
          updatedEntries[existingIdx] = entry;
          merged++;
        } else {
          updatedEntries.push(entry);
          promoted++;
        }
      }
    }

    // Handle contradictions
    for (const obs of contradictions) {
      const targetId = obs.contradicts!;
      const originalObs = newObs.find((o) => o.obs_id === targetId);
      if (!originalObs) continue;

      const quarantineId = crypto.randomUUID();
      const pair = demote(originalObs, obs, Date.now(), quarantineId);
      await quarantine.add(pair);

      // Remove the quarantined entry from consolidated
      const idx = updatedEntries.findIndex((e) => e.obs_id === targetId);
      if (idx >= 0) {
        updatedEntries.splice(idx, 1);
      }
      quarantined++;
    }

    // Write updated consolidated
    const hash = await writeConsolidated(input.domain, updatedEntries);

    // Roll archive — use current run's timestamp so newly processed obs are archived immediately
    archived = await archive.roll(input.domain, now);

    // Update state
    const ledgerCount = (await readLedgerSince(input.domain, 0)).length;
    const quarantineList = await quarantine.list(input.domain);
    await stateStore.write(input.domain, {
      name: input.domain,
      ledger_count: ledgerCount,
      consolidated_count: updatedEntries.length,
      quarantine_count: quarantineList.length,
      last_consolidated_ts: now,
      content_hash: hash,
    });

    return JSON.stringify({ merged, promoted, archived, quarantined });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
