import { z } from "zod";
import { homedir } from "os";
import path from "path";

const DEFAULT_CONFIG_PATH = path.join(
  homedir(),
  ".claude",
  "mcp-servers",
  "quorum",
  "config.json"
);

const TTL_TYPES = [
  "verified-api-endpoint",
  "verified-static-behavior",
  "verified-workflow",
  "gotcha",
  "failure-mode",
  "hypothesis",
] as const;

const positiveInt = z.number().int().positive();

const ConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  storage_dir: z.string(),
  dashboard: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string(),
  }),
  similarity: z.object({
    engine: z.string(),
    api_keys: z.object({
      anthropic: z.string().nullable(),
      openai: z.string().nullable(),
      gemini: z.string().nullable(),
      deepseek: z.string().nullable(),
      minimax: z.string().nullable(),
    }),
    claude_model: z.string(),
  }),
  ttl_defaults: z.object({
    "verified-api-endpoint": positiveInt,
    "verified-static-behavior": positiveInt,
    "verified-workflow": positiveInt,
    gotcha: positiveInt,
    "failure-mode": positiveInt,
    hypothesis: positiveInt,
  }),
  consolidation: z.object({
    min_consensus_count: positiveInt,
  }),
  domains: z.record(z.string(), z.unknown()),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  $schema: "https://quorum.local/config.schema.json",
  version: "0.1.0",
  storage_dir: path.join(homedir(), ".claude", "mcp-servers", "quorum", "data"),
  dashboard: {
    port: 4729,
    host: "127.0.0.1",
  },
  similarity: {
    engine: "hash-only",
    api_keys: {
      anthropic: null,
      openai: null,
      gemini: null,
      deepseek: null,
      minimax: null,
    },
    claude_model: "claude-haiku-4-5-20251001",
  },
  ttl_defaults: {
    "verified-api-endpoint": 30,
    "verified-static-behavior": 365,
    "verified-workflow": 60,
    gotcha: 90,
    "failure-mode": 180,
    hypothesis: 14,
  },
  consolidation: {
    min_consensus_count: 2,
  },
  domains: {},
};

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH): Promise<Config> {
  const file = Bun.file(configPath);
  const exists = await file.exists();
  if (!exists) {
    return DEFAULT_CONFIG;
  }
  const raw = await file.json();
  return ConfigSchema.parse(raw);
}

export async function saveConfig(config: Config, configPath = DEFAULT_CONFIG_PATH): Promise<void> {
  const validated = ConfigSchema.parse(config);
  await Bun.write(configPath, JSON.stringify(validated, null, 2) + "\n");
}

export { DEFAULT_CONFIG_PATH, TTL_TYPES };
