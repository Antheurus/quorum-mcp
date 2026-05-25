import { consolidatedPath, resolveStorageDir, atomicWrite } from "../paths.ts";
import type { ConsolidatedEntry } from "../types.ts";

function computeContentHash(entries: ConsolidatedEntry[]): string {
  const canonical = JSON.stringify(entries, Object.keys(entries[0] ?? {}).sort());
  return Bun.hash(canonical).toString(16);
}

function entriesToMarkdown(entries: ConsolidatedEntry[], hash: string): string {
  const sections = entries.map((e) => {
    const refs = e.evidence_refs.join(", ");
    const confirmedBy = e.confirmed_by.join(", ");
    return [
      `## ${e.obs_id}`,
      `**status**: ${e.status}`,
      `**claim**: ${e.claim}`,
      `**evidence_refs**: ${refs}`,
      `**confirmed_by**: ${confirmedBy}`,
      `**ttl_expires_at**: ${e.ttl_expires_at}`,
      `**last_verified_at**: ${e.last_verified_at}`,
    ].join("\n");
  });

  const header = `<!-- quorum-hash: ${hash} -->`;
  return [header, ...sections].join("\n\n");
}

function markdownToEntries(content: string): { entries: ConsolidatedEntry[]; hash: string } {
  const hashMatch = content.match(/<!-- quorum-hash: ([a-f0-9]+) -->/);
  const hash = hashMatch?.[1] ?? "";

  const sections = content.split(/\n## /).slice(1);
  const entries: ConsolidatedEntry[] = sections.map((section) => {
    const lines = ("## " + section).split("\n");
    const obs_id = lines[0].replace("## ", "").trim();

    const get = (key: string): string => {
      const line = lines.find((l) => l.startsWith(`**${key}**:`));
      return line ? line.replace(`**${key}**: `, "").trim() : "";
    };

    const getList = (key: string): string[] => {
      const val = get(key);
      return val ? val.split(", ").filter(Boolean) : [];
    };

    return {
      obs_id,
      status: get("status") as ConsolidatedEntry["status"],
      claim: get("claim"),
      evidence_refs: getList("evidence_refs"),
      confirmed_by: getList("confirmed_by"),
      ttl_expires_at: Number(get("ttl_expires_at")),
      last_verified_at: Number(get("last_verified_at")),
    };
  });

  return { entries, hash };
}

export async function writeConsolidated(
  domain: string,
  entries: ConsolidatedEntry[]
): Promise<string> {
  const storageDir = await resolveStorageDir();
  const filePath = consolidatedPath(storageDir, domain);
  const hash = computeContentHash(entries);
  const markdown = entriesToMarkdown(entries, hash);
  await atomicWrite(filePath, markdown);
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
  const content = await file.text();
  return markdownToEntries(content);
}
