import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import * as stateStore from "../storage/state.ts";
import { resolveStorageDir } from "../paths.ts";
import type { DomainState } from "../types.ts";

export const name = "learn_status";

export const schema = z.object({
  domain: z.string().optional().describe("Optional domain name. If omitted, returns status for all known domains."),
});

type StatusInput = z.infer<typeof schema>;

async function getKnownDomains(storageDir: string): Promise<string[]> {
  const consolidatedDir = path.join(storageDir, "consolidated");
  try {
    const files = await fs.readdir(consolidatedDir);
    return files
      .filter((f) => f.endsWith(".json") && f !== ".keep")
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export async function handler(input: StatusInput): Promise<string> {
  try {
    const storageDir = await resolveStorageDir();

    let domainNames: string[];
    if (input.domain) {
      domainNames = [input.domain];
    } else {
      domainNames = await getKnownDomains(storageDir);
    }

    const domains: DomainState[] = await Promise.all(
      domainNames.map((name) => stateStore.read(name))
    );

    return JSON.stringify({ domains });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
