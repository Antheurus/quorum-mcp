import { promises as fs } from "fs";
import { ledgerPath, resolveStorageDir } from "../paths.ts";
import type { Observation } from "../types.ts";

export async function appendObservation(domain: string, obs: Observation): Promise<void> {
  const storageDir = await resolveStorageDir();
  const filePath = ledgerPath(storageDir, domain);
  const line = JSON.stringify(obs) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}

export async function readLedgerSince(domain: string, marker: number): Promise<Observation[]> {
  const storageDir = await resolveStorageDir();
  const filePath = ledgerPath(storageDir, domain);

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return [];

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim() !== "");

  const results: Observation[] = [];
  for (const line of lines) {
    try {
      const obs = JSON.parse(line) as Observation;
      if (obs.ts > marker) results.push(obs);
    } catch {
      // skip malformed lines
    }
  }
  return results;
}

export async function readAllLedger(domain: string): Promise<Observation[]> {
  return readLedgerSince(domain, 0);
}
