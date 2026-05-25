import type { SimilarityEngine } from "../types.js";

function normalizeForHash(claim: string): string {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

// Union-Find for grouping indices
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

export class HashOnlyEngine implements SimilarityEngine {
  readonly name = "hash-only";

  // Jaccard threshold: >= 0.3 catches 2-word phrases sharing 1 token (J=1/3)
  private readonly JACCARD_THRESHOLD = 0.3;

  async available(): Promise<boolean> {
    return true;
  }

  async cluster(claims: string[]): Promise<number[][]> {
    if (claims.length === 0) return [];

    const normalized = claims.map(normalizeForHash);
    const uf = new UnionFind(claims.length);

    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        // Exact match (hash equality)
        if (normalized[i] === normalized[j]) {
          uf.union(i, j);
          continue;
        }
        // Jaccard normalized substring similarity
        const sim = jaccardSimilarity(normalized[i], normalized[j]);
        if (sim >= this.JACCARD_THRESHOLD) {
          uf.union(i, j);
        }
      }
    }

    // Group indices by root
    const groups = new Map<number, number[]>();
    for (let i = 0; i < claims.length; i++) {
      const root = uf.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    return [...groups.values()];
  }

  estimateCost(_claimCount: number): string {
    return "$0.00 — no API calls";
  }
}
