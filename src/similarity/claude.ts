import Anthropic from "@anthropic-ai/sdk";
import type { SimilarityEngine } from "../types.js";
import type { Config } from "../config.js";

const SYSTEM_PROMPT = `You are a claim clustering assistant. Given a list of claims, group them by topic similarity.
Return ONLY a JSON array of arrays of zero-based indices. Each inner array is one cluster.
Every index 0..N-1 must appear in exactly one cluster.
Example for 3 claims where 0 and 1 are similar: [[0,1],[2]]
Do not include any explanation, markdown, or text outside the JSON.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ClaudeEngine implements SimilarityEngine {
  readonly name: string;
  private readonly apiKey: string | null;
  private readonly model: string;

  constructor(config: Config, model: string) {
    this.model = model;
    this.apiKey = config.similarity.api_keys.anthropic;
    this.name = model.includes("haiku") ? "claude-haiku" : "claude-sonnet";
  }

  async available(): Promise<boolean> {
    try {
      return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
    } catch {
      return false;
    }
  }

  async cluster(claims: string[]): Promise<number[][]> {
    if (claims.length === 0) return [];
    if (claims.length === 1) return [[0]];

    const client = new Anthropic({ apiKey: this.apiKey ?? undefined });

    const userMessage = claims
      .map((c, i) => `${i}: ${c}`)
      .join("\n");

    // 200ms delay to stay within haiku free-tier rate limit (50 req/min)
    await sleep(200);

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache system prompt to reduce cost on repeated calls
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Cluster these ${claims.length} claims:\n${userMessage}`,
        },
      ],
    });

    const raw = response.content[0];
    if (raw.type !== "text") {
      throw new Error("Claude returned unexpected content type");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text.trim());
    } catch {
      throw new Error(`Claude returned non-JSON response: ${raw.text}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Claude response is not an array: ${raw.text}`);
    }

    return parsed as number[][];
  }

  estimateCost(claimCount: number): string {
    // Rough estimate: ~50 tokens per claim input + 10 tokens output per claim
    const inputTokens = claimCount * 50 + 200; // system prompt ~200 tokens
    const outputTokens = claimCount * 10;
    const model = this.model;
    if (model.includes("haiku")) {
      // haiku: $0.80/M input, $4.00/M output
      const cost = (inputTokens * 0.0000008) + (outputTokens * 0.000004);
      return `~$${cost.toFixed(4)} (claude-haiku)`;
    }
    // sonnet: $3.00/M input, $15.00/M output
    const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
    return `~$${cost.toFixed(4)} (claude-sonnet)`;
  }
}
