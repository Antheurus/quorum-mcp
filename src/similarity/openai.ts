import OpenAI from "openai";
import type { SimilarityEngine } from "../types.js";
import type { Config } from "../config.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const COSINE_THRESHOLD = 0.85;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Union-Find for grouping
class UnionFind {
  private parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) this.parent[px] = py;
  }
}

export class OpenAIEmbedEngine implements SimilarityEngine {
  readonly name = "openai-embed";
  private readonly apiKey: string | null;

  constructor(config: Config) {
    this.apiKey = config.similarity.api_keys.openai;
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

    const client = new OpenAI({ apiKey: this.apiKey ?? undefined });

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: claims,
    });

    // Sort by index to ensure order matches claims array
    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    const uf = new UnionFind(claims.length);

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosine(embeddings[i], embeddings[j]);
        if (sim > COSINE_THRESHOLD) {
          uf.union(i, j);
        }
      }
    }

    const groups = new Map<number, number[]>();
    for (let i = 0; i < claims.length; i++) {
      const root = uf.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    return [...groups.values()];
  }

  estimateCost(claimCount: number): string {
    // text-embedding-3-small: $0.02/M tokens. ~10 tokens per claim average.
    const tokens = claimCount * 10;
    const cost = tokens * 0.00000002;
    return `~$${cost.toFixed(6)} (text-embedding-3-small)`;
  }
}
