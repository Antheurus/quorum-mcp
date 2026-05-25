import type { SimilarityEngine } from "../types.js";
import type { Config } from "../config.js";

export type { SimilarityEngine };

export const ENGINE_NAMES = [
  "hash-only",
  "claude-haiku",
  "claude-sonnet",
  "openai-embed",
  "gemini",
  "deepseek",
  "minimax",
  "local-minilm",
] as const;

export type EngineName = (typeof ENGINE_NAMES)[number];

export type EngineStatusValue = "battle-tested" | "untested" | "stub — contribute";

export const ENGINE_STATUS: Record<EngineName, EngineStatusValue> = {
  "hash-only": "battle-tested",
  "claude-haiku": "battle-tested",
  "claude-sonnet": "untested",
  "openai-embed": "untested",
  "gemini": "untested",
  "deepseek": "stub — contribute",
  "minimax": "stub — contribute",
  "local-minilm": "stub — contribute",
};

export function getEngineStatus(name: string): EngineStatusValue {
  return ENGINE_STATUS[name as EngineName] ?? "untested";
}

export async function getEngine(name: string, config: Config): Promise<SimilarityEngine> {
  switch (name as EngineName) {
    case "hash-only": {
      const { HashOnlyEngine } = await import("./hash-only.js");
      return new HashOnlyEngine();
    }
    case "claude-haiku":
    case "claude-sonnet": {
      const { ClaudeEngine } = await import("./claude.js");
      return new ClaudeEngine(config.similarity.claude_model);
    }
    case "openai-embed": {
      const { OpenAIEmbedEngine } = await import("./openai.js");
      return new OpenAIEmbedEngine(config);
    }
    case "gemini": {
      const { GeminiEngine } = await import("./gemini.js");
      return new GeminiEngine(config);
    }
    case "deepseek":
    case "minimax":
    case "local-minilm": {
      const { makeStub } = await import("./stubs.js");
      return makeStub(name);
    }
    default:
      throw new Error(`Unknown similarity engine: "${name}". Valid options: ${ENGINE_NAMES.join(", ")}`);
  }
}
