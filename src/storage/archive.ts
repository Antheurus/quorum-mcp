import { promises as fs } from "fs";
import { ledgerPath, archivePath, resolveStorageDir, atomicWrite } from "../paths.ts";
import type { Observation } from "../types.ts";

function monthSuffix(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export async function roll(domain: string, beforeTs: number): Promise<number> {
  const storageDir = await resolveStorageDir();
  const filePath = ledgerPath(storageDir, domain);

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return 0;

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim() !== "");

  const toArchive: Observation[] = [];
  const toKeep: string[] = [];

  for (const line of lines) {
    try {
      const obs = JSON.parse(line) as Observation;
      if (obs.ts < beforeTs) {
        toArchive.push(obs);
      } else {
        toKeep.push(line);
      }
    } catch {
      toKeep.push(line);
    }
  }

  if (toArchive.length === 0) return 0;

  // Group by yyyy-mm and append to monthly archive files
  const byMonth = new Map<string, Observation[]>();
  for (const obs of toArchive) {
    const suffix = monthSuffix(obs.ts);
    const group = byMonth.get(suffix) ?? [];
    group.push(obs);
    byMonth.set(suffix, group);
  }

  for (const [suffix, entries] of byMonth) {
    const dest = archivePath(storageDir, domain, suffix);
    const appendContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fs.appendFile(dest, appendContent, "utf8");
  }

  // Rewrite active ledger with only kept lines (atomic)
  const keepContent = toKeep.length > 0 ? toKeep.join("\n") + "\n" : "";
  await atomicWrite(filePath, keepContent);

  return toArchive.length;
}
