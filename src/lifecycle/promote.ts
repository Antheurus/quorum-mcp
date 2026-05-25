import type { Observation, ConsolidatedEntry, QuarantinePair } from "../types.js";
import { computeTtlExpiry } from "./ttl.js";

export function promote(
  cluster: Observation[],
  existing: ConsolidatedEntry[],
  now: number
): { status: "hypothesis" | "verified"; confirmed_by: string[]; ttl_expires_at: number } {
  const clusterAgents = cluster.map((o) => o.agent_id);
  const clusterObsIds = new Set(cluster.map((o) => o.obs_id));

  // Find any existing entry that overlaps with this cluster (by obs_id or agent)
  const primaryObsId = cluster[0]?.obs_id;
  const existingEntry = existing.find(
    (e) =>
      clusterObsIds.has(e.obs_id) ||
      e.obs_id === primaryObsId ||
      e.confirmed_by.some((agent) => clusterAgents.includes(agent))
  );

  // Merge confirmed_by from existing entry (if any) with new cluster agents
  const priorAgents = existingEntry?.confirmed_by ?? [];
  const mergedAgents = [...new Set([...priorAgents, ...clusterAgents])];

  const status: "hypothesis" | "verified" = mergedAgents.length >= 2 ? "verified" : "hypothesis";
  // TTL always computed from current ts — handles both fresh entries and re-shouts of
  // expired verified entries (spec: "re-shout resets TTL from current Date.now()").
  const type = cluster[0]?.type ?? "hypothesis";
  const ttl_expires_at = computeTtlExpiry(type, now);

  return { status, confirmed_by: mergedAgents, ttl_expires_at };
}

export function demote(obs: Observation, contradictingObs: Observation, now: number, quarantineId: string): QuarantinePair {
  return {
    quarantine_id: quarantineId,
    old_obs: obs,
    new_obs: contradictingObs,
    created_at: now,
    resolution_status: "pending",
  };
}
