import type { SimilarityEngine } from "../types.js";

const CONTRIBUTE_URL = "https://github.com/your-org/quorum-mcp/blob/main/CONTRIBUTING.md";

type StubEngineName = "deepseek" | "minimax" | "local-minilm";

class StubEngine implements SimilarityEngine {
  readonly name: string;

  constructor(name: StubEngineName) {
    this.name = name;
  }

  async available(): Promise<boolean> {
    return false;
  }

  async cluster(_claims: string[]): Promise<number[][]> {
    throw new Error(
      `Engine "${this.name}" not yet implemented — contribute via ${CONTRIBUTE_URL}`
    );
  }

  estimateCost(_claimCount: number): string {
    return "N/A — engine not yet implemented";
  }
}

export function makeStub(name: string): SimilarityEngine {
  return new StubEngine(name as StubEngineName);
}
