import { homedir } from "os";
import path from "path";
import { loadConfig } from "./config.ts";

const QUORUM_ROOT = path.join(homedir(), ".claude", "mcp-servers", "quorum");
const CONFIG_PATH = path.join(QUORUM_ROOT, "config.json");

const STORAGE_SUBDIRS = ["ledger", "consolidated", "quarantine", "archive"] as const;
export type StorageSubdir = (typeof STORAGE_SUBDIRS)[number];

export function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(homedir(), p.slice(2));
  }
  return p;
}

export async function resolveStorageDir(): Promise<string> {
  const config = await loadConfig(CONFIG_PATH);
  return expandHome(config.storage_dir);
}

export async function ensureStorageDirs(storageDir: string): Promise<void> {
  for (const sub of STORAGE_SUBDIRS) {
    await Bun.write(path.join(storageDir, sub, ".keep"), "");
  }
}

export function ledgerPath(storageDir: string, domain: string): string {
  return path.join(storageDir, "ledger", `${domain}.jsonl`);
}

export function consolidatedPath(storageDir: string, domain: string): string {
  return path.join(storageDir, "consolidated", `${domain}.json`);
}

export function quarantinePath(storageDir: string, domain: string): string {
  return path.join(storageDir, "quarantine", `${domain}.json`);
}

export function archivePath(storageDir: string, domain: string, suffix: string): string {
  return path.join(storageDir, "archive", `${domain}_${suffix}.jsonl`);
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = filePath + ".tmp." + Date.now();
  await Bun.write(tmp, content);
  const fs = await import("fs/promises");
  await fs.rename(tmp, filePath);
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return null;
  return file.json() as Promise<T>;
}
