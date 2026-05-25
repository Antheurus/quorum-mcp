import { consolidatedPath, resolveStorageDir, atomicWrite } from "../paths.ts";
import type { ConsolidatedEntry } from "../types.ts";

export async function writeConsolidated(
  domain: string,
  entries: ConsolidatedEntry[]
): Promise<string> {
  const storageDir = await resolveStorageDir();
  const filePath = consolidatedPath(storageDir, domain);
  const sorted = [...entries].sort((a, b) => a.obs_id.localeCompare(b.obs_id));
  const content = JSON.stringify(sorted, null, 2);
  const hash = Bun.hash(JSON.stringify(sorted)).toString(16);
  await atomicWrite(filePath, content);
  return hash;
}

export async function readConsolidated(
  domain: string
): Promise<{ entries: ConsolidatedEntry[]; hash: string } | null> {
  const storageDir = await resolveStorageDir();
  const filePath = consolidatedPath(storageDir, domain);
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return null;
  try {
    const text = await file.text();
    const entries = JSON.parse(text) as ConsolidatedEntry[];
    const sorted = [...entries].sort((a, b) => a.obs_id.localeCompare(b.obs_id));
    const hash = Bun.hash(JSON.stringify(sorted)).toString(16);
    return { entries, hash };
  } catch {
    return null;
  }
}
