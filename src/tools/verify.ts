import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import { readLedgerSince } from "../storage/ledger.ts";
import { readConsolidated, writeConsolidated } from "../storage/consolidated.ts";
import { computeTtlExpiry } from "../lifecycle/ttl.ts";
import { loadConfig } from "../config.ts";
import { resolveStorageDir } from "../paths.ts";
import type { Observation } from "../types.ts";

export const name = "learn_verify";

export const schema = z.object({
  obs_id: z.string().describe("The obs_id of the observation to verify/refresh"),
  domain: z.string().describe("Knowledge domain containing the observation"),
});

type VerifyInput = z.infer<typeof schema>;

async function findObsById(domain: string, obsId: string): Promise<Observation | null> {
  const allObs = await readLedgerSince(domain, 0);
  const found = allObs.find((o) => o.obs_id === obsId);
  if (found) return found;

  const storageDir = await resolveStorageDir();
  const archiveDir = path.join(storageDir, "archive");
  try {
    const files = await fs.readdir(archiveDir);
    for (const file of files) {
      if (!file.startsWith(domain + "_")) continue;
      const content = await Bun.file(path.join(archiveDir, file)).text();
      for (const line of content.split("\n").filter(Boolean)) {
        try {
          const obs = JSON.parse(line) as Observation;
          if (obs.obs_id === obsId) return obs;
        } catch {}
      }
    }
  } catch {}
  return null;
}

export async function handler(input: VerifyInput): Promise<string> {
  try {
    const config = await loadConfig();

    // Resolve the observation type (needed for TTL computation), including archives
    const obs = await findObsById(input.domain, input.obs_id);

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
