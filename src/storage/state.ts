import { statePath, resolveStorageDir, atomicWrite } from "../paths.ts";
import type { DomainState } from "../types.ts";

function defaultState(domain: string): DomainState {
  return {
    name: domain,
    ledger_count: 0,
    consolidated_count: 0,
    quarantine_count: 0,
    last_consolidated_ts: 0,
    content_hash: "",
  };
}

export async function read(domain: string): Promise<DomainState> {
  const storageDir = await resolveStorageDir();
  const filePath = statePath(storageDir, domain);
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return defaultState(domain);
  try {
    return (await file.json()) as DomainState;
  } catch {
    return defaultState(domain);
  }
}

export async function write(domain: string, state: DomainState): Promise<void> {
  const storageDir = await resolveStorageDir();
  const filePath = statePath(storageDir, domain);
  await atomicWrite(filePath, JSON.stringify(state, null, 2));
}
