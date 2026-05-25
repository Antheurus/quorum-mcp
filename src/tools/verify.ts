import { z } from "zod";
import { readLedgerSince } from "../storage/ledger.ts";
import { readConsolidated, writeConsolidated } from "../storage/consolidated.ts";
import { computeTtlExpiry } from "../lifecycle/ttl.ts";
import { loadConfig } from "../config.ts";

export const name = "learn_verify";

export const schema = z.object({
  obs_id: z.string().describe("The obs_id of the observation to verify/refresh"),
  domain: z.string().describe("Knowledge domain containing the observation"),
});

type VerifyInput = z.infer<typeof schema>;

export async function handler(input: VerifyInput): Promise<string> {
  try {
    const config = await loadConfig();

    // Resolve the observation type (needed for TTL computation)
    const allObs = await readLedgerSince(input.domain, 0);
    const obs = allObs.find((o) => o.obs_id === input.obs_id);

    if (!obs) {
      return JSON.stringify({ error: `obs_id not found in ledger: ${input.obs_id}` });
    }

    const now = Date.now();
    const newTtlExpiresAt = computeTtlExpiry(obs.type, now, config.ttl_defaults);

    // Update the consolidated entry
    const existing = await readConsolidated(input.domain);
    if (!existing) {
      return JSON.stringify({ error: `No consolidated data found for domain: ${input.domain}` });
    }

    const entryIdx = existing.entries.findIndex((e) => e.obs_id === input.obs_id);
    if (entryIdx < 0) {
      return JSON.stringify({ error: `obs_id not found in consolidated: ${input.obs_id}` });
    }

    const updatedEntries = [...existing.entries];
    updatedEntries[entryIdx] = {
      ...updatedEntries[entryIdx],
      last_verified_at: now,
      ttl_expires_at: newTtlExpiresAt,
    };

    await writeConsolidated(input.domain, updatedEntries);

    return JSON.stringify({ obs_id: input.obs_id, new_ttl_expires_at: newTtlExpiresAt });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
