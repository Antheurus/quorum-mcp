import { promises as fs } from "fs";
import { quarantinePath, resolveStorageDir } from "../paths.ts";
import type { QuarantinePair } from "../types.ts";

export async function add(pair: QuarantinePair): Promise<void> {
  const storageDir = await resolveStorageDir();
  const filePath = quarantinePath(storageDir, pair.old_obs.domain);
  const line = JSON.stringify(pair) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}

export async function list(domain: string): Promise<QuarantinePair[]> {
  const storageDir = await resolveStorageDir();
  const filePath = quarantinePath(storageDir, domain);
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return [];

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim() !== "");

  // Build a map: last-seen record per quarantine_id wins (resolution records override)
  const byId = new Map<string, QuarantinePair>();
  for (const line of lines) {
    try {
      const record = JSON.parse(line) as QuarantinePair;
      byId.set(record.quarantine_id, record);
    } catch {
      // skip malformed lines
    }
  }

  return Array.from(byId.values());
}

export async function resolve(
  domain: string,
  quarantineId: string,
  resolution: "resolved_old" | "resolved_new"
): Promise<void> {
  const pairs = await list(domain);
  const pair = pairs.find((p) => p.quarantine_id === quarantineId);
  if (!pair) throw new Error(`quarantine_id not found: ${quarantineId}`);

  const storageDir = await resolveStorageDir();
  const filePath = quarantinePath(storageDir, domain);

  const updated: QuarantinePair = { ...pair, resolution_status: resolution };
  const line = JSON.stringify(updated) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}
