import type { Observation, ConsolidatedEntry } from "../types.js";

const TTL_DEFAULTS_DAYS: Record<string, number> = {
  "verified-api-endpoint": 30,
  "verified-static-behavior": 365,
  "verified-workflow": 60,
  "gotcha": 90,
  "failure-mode": 180,
  "hypothesis": 14,
};

const MS_PER_DAY = 86_400_000;

export function computeTtlExpiry(
  type: string,
  ts: number,
  overrides?: Partial<Record<string, number>>
): number {
  const days = overrides?.[type] ?? TTL_DEFAULTS_DAYS[type] ?? 14;
  return ts + days * MS_PER_DAY;
}

export function isExpired(entry: ConsolidatedEntry, now: number): boolean {
  return now > entry.ttl_expires_at;
}

export function isDecayed(obs: Observation, now: number, overrides?: Partial<Record<string, number>>): boolean {
  const expiry = computeTtlExpiry(obs.type, obs.ts, overrides);
  return now > expiry;
}
