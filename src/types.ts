export interface Observation {
  obs_id: string;
  domain: string;
  type: string;
  claim: string;
  evidence: string;
  refs: string[];
  agent_id: string;
  ts: number;
  contradicts: string | null;
}

export interface ConsolidatedEntry {
  obs_id: string;
  status: "hypothesis" | "verified" | "stale" | "contested";
  claim: string;
  evidence_refs: string[];
  confirmed_by: string[];
  ttl_expires_at: number;
  last_verified_at: number;
}

export interface QuarantinePair {
  quarantine_id: string;
  old_obs: Observation;
  new_obs: Observation;
  created_at: number;
  resolution_status: "pending" | "resolved_old" | "resolved_new";
}

export interface DomainState {
  name: string;
  ledger_count: number;
  consolidated_count: number;
  quarantine_count: number;
  last_consolidated_ts: number;
  content_hash: string;
}

export interface SimilarityEngine {
  name: string;
  available(): Promise<boolean>;
  cluster(claims: string[]): Promise<number[][]>;
  estimateCost(claimCount: number): string;
}
