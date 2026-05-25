import { z } from "zod";
import { readLedgerSince } from "../storage/ledger.ts";
import { readConsolidated, writeConsolidated } from "../storage/consolidated.ts";
import * as quarantine from "../storage/quarantine.ts";
import { demote } from "../lifecycle/promote.ts";
import type { Observation } from "../types.ts";

export const name = "learn_contradict";

export const schema = z.object({
  obs_id: z.string().describe("The obs_id of the existing observation being contradicted"),
  claim: z.string().describe("The contradicting claim"),
  evidence: z.string().max(800).describe("Evidence supporting the contradiction (max 800 chars)"),
  agent_id: z.string().describe("Identifier of the agent making the contradicting observation"),
  domain: z.string().describe("Knowledge domain containing the original observation"),
});

type ContradictInput = z.infer<typeof schema>;

export async function handler(input: ContradictInput): Promise<string> {
  try {
    // Find original observation in the full ledger
    const allObs = await readLedgerSince(input.domain, 0);
    const originalObs = allObs.find((o) => o.obs_id === input.obs_id);

    if (!originalObs) {
      return JSON.stringify({ error: `obs_id not found in ledger: ${input.obs_id}` });
    }

    // Build the new contradicting observation
    const newObs: Observation = {
      obs_id: crypto.randomUUID(),
      domain: input.domain,
      type: originalObs.type,
      claim: input.claim,
      evidence: input.evidence,
      refs: [],
      agent_id: input.agent_id,
      ts: Date.now(),
      contradicts: input.obs_id,
    };

    const quarantineId = crypto.randomUUID();
    const pair = demote(originalObs, newObs, Date.now(), quarantineId);
    await quarantine.add(pair);

    // Mark original as contested in consolidated
    const existing = await readConsolidated(input.domain);
    if (existing) {
      const updatedEntries = existing.entries.map((e) =>
        e.obs_id === input.obs_id ? { ...e, status: "contested" as const } : e
      );
      await writeConsolidated(input.domain, updatedEntries);
    }

    return JSON.stringify({ quarantine_id: quarantineId });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
