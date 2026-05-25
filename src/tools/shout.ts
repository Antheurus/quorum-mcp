import { z } from "zod";
import { appendObservation } from "../storage/ledger.ts";
import type { Observation } from "../types.ts";

export const name = "learn_shout";

export const schema = z.object({
  domain: z.string().describe("Knowledge domain this observation belongs to (e.g. 'edlink', 'typescript')"),
  type: z.string().describe("Observation type: hypothesis, gotcha, verified-api-endpoint, verified-static-behavior, verified-workflow, failure-mode"),
  claim: z.string().describe("The core factual claim being recorded"),
  evidence: z.string().max(800).describe("Supporting evidence or context for the claim (max 800 chars)"),
  refs: z.array(z.string()).optional().describe("Optional list of reference strings (URLs, file paths, obs_ids)"),
  agent_id: z.string().describe("Identifier of the agent or session making this observation"),
  contradicts: z.string().optional().describe("Optional obs_id of a previous observation this one contradicts"),
});

type ShoutInput = z.infer<typeof schema>;

export async function handler(input: ShoutInput): Promise<string> {
  try {
    const obs: Observation = {
      obs_id: crypto.randomUUID(),
      domain: input.domain,
      type: input.type,
      claim: input.claim,
      evidence: input.evidence,
      refs: input.refs ?? [],
      agent_id: input.agent_id,
      ts: Date.now(),
      contradicts: input.contradicts ?? null,
    };
    await appendObservation(input.domain, obs);
    return JSON.stringify({ obs_id: obs.obs_id });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
