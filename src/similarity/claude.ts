// @ts-ignore — claude-agent-sdk types may lag behind runtime shape
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "child_process";
import type { SimilarityEngine } from "../types.js";

const SYSTEM_PROMPT = `You are a claim clustering assistant. Given a list of claims, group them by topic similarity.
Return ONLY a JSON array of arrays of zero-based indices. Each inner array is one cluster.
Every index 0..N-1 must appear in exactly one cluster.
Example for 3 claims where 0 and 1 are similar: [[0,1],[2]]
Do not include any explanation, markdown, or text outside the JSON.`;

export class ClaudeEngine implements SimilarityEngine {
  readonly name: string;
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
    this.name = model.includes("haiku") ? "claude-haiku" : "claude-sonnet";
  }

  async available(): Promise<boolean> {
    try {
      execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async cluster(claims: string[]): Promise<number[][]> {
    if (claims.length === 0) return [];
    if (claims.length === 1) return [[0]];

    const userMessage = claims.map((c, i) => `${i}: ${c}`).join("\n");
    const clusteringPrompt = `${SYSTEM_PROMPT}\n\nCluster these ${claims.length} claims:\n${userMessage}`;

    let resultText = "";

    const queryResult = query({
      prompt: clusteringPrompt,
      options: {
        model: this.model,
        disallowedTools: ["Bash", "Edit", "Write", "Task"],
      },
    });

    for await (const event of queryResult) {
      if ((event as any).type === "result" && (event as any).subtype === "success") {
        resultText = (event as any).result;
        break;
      }
    }

    if (!resultText) {
      throw new Error("Claude returned empty result");
    }

    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(`Claude returned no JSON array: ${resultText}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(`Claude returned non-JSON response: ${resultText}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Claude response is not an array: ${resultText}`);
    }

    return parsed as number[][];
  }

  estimateCost(_claimCount: number): string {
    return "~$0.00 (claude via CC OAuth — billed through CC subscription)";
  }
}
