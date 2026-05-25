import type { Observation, ConsolidatedEntry, QuarantinePair } from "../types.js";
import { computeTtlExpiry } from "./ttl.js";

export function promote(
  cluster: Observation[],
  existing: ConsolidatedEntry[]
): { status: "hypothesis" | "verified"; confirmed_by: string[]; ttl_expires_at: number } {
  const distinctAgents = [...new Set(cluster.map((o) => o.agent_id))];
  const status: "hypothesis" | "verified" = distinctAgents.length >= 2 ? "verified" : "hypothesis";

  const now = Date.now();
  // TTL always computed from current ts — handles both fresh entries and re-shouts of
  // expired verified entries (spec: "re-shout resets TTL from current Date.now()").
  const type = cluster[0]?.type ?? "hypothesis";
  const ttl_expires_at = computeTtlExpiry(type, now);

  return { status, confirmed_by: distinctAgents, ttl_expires_at };
}

export function demote(obs: Observation, contradictingObs: Observation): QuarantinePair {
  return {
    quarantine_id: crypto.randomUUID(),
    old_obs: obs,
    new_obs: contradictingObs,
    created_at: Date.now(),
    resolution_status: "pending",
  };
}
