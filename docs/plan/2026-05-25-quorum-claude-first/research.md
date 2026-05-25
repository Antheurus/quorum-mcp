---
feature: quorum-claude-first-default-and-battle-test
created: 2026-05-25
updated: 2026-05-25T00:00Z
status: ready-for-plan
---

# Research — Quorum claude-first default + battle test

## Definition of done

> "1) CLAUDE-FIRST DEFAULT — small refactor: change config default from `hash-only` to `claude-haiku`, make `ANTHROPIC_API_KEY` a required startup credential when claude-* is the active engine, surface engine status in the dashboard so user can SEE which engines are battle-tested vs untested vs stubbed.
> 2) BATTLE TEST — exercise claude-haiku in real swarm conditions: real Anthropic API calls, real Claude Code MCP roundtrip, real parallel subagents hammering shout/consolidate/recall."
> — user, 2026-05-25

Done means:
- `DEFAULT_CONFIG.similarity.engine` is `"claude-haiku"` and the live `~/.claude/mcp-servers/quorum/config.json` is updated to match.
- All 8 engines remain in `ENGINE_NAMES` and `getEngine` switch; **nothing is deleted**.
- Active claude-* engine without a usable API key causes a **loud startup failure** in both `src/index.ts` (MCP entry) and the consolidator CLI (`bin/quorum.ts consolidate`). No silent fallback to hash-only.
- `quorum init` prompts for `ANTHROPIC_API_KEY` (skippable, "needed for the default claude-haiku engine; skip if you'll use hash-only") when no env var is present and no key is already saved.
- Dashboard engine dropdown shows a status tag next to each engine name: `battle-tested` / `untested` / `stub — contribute`. Tag source is a hardcoded map exported from `src/similarity/engine.ts` (not runtime-probed).
- After this orchestration completes green, `claude-haiku` reads `battle-tested` and `hash-only` reads `battle-tested`. All other engines retain `untested` or `stub — contribute`.
- Three battle-test artifacts live under `tests/battle-test/` (separate from `tests/uat/`): an Anthropic SDK smoke, an MCP+lifecycle smoke, and a concurrent swarm runner. All exit 0 when the active engine is wired correctly.
- All pre-existing 185 UAT tests still pass.

## Verbatim captures

### `src/config.ts:58-88` — current `DEFAULT_CONFIG`

```ts
export const DEFAULT_CONFIG: Config = {
  $schema: "https://quorum.local/config.schema.json",
  version: "0.1.0",
  storage_dir: path.join(homedir(), ".claude", "mcp-servers", "quorum", "data"),
  dashboard: {
    port: 4729,
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
```

`engine: "hash-only"` is the only field that must change. Schema (`ConfigSchema`, line 24) requires `engine: z.string()` — no enum constraint, so changing the default value does not require schema edits.

### `~/.claude/mcp-servers/quorum/config.json` (live, on disk)

```json
{
  "$schema": "https://quorum.local/config.schema.json",
  "version": "0.1.0",
  "storage_dir": "/Users/macbook/.claude/mcp-servers/quorum/data",
  "dashboard": {
    "port": 4729,
    "host": "127.0.0.1"
  },
  "similarity": {
    "engine": "hash-only",
    "api_keys": {
      "anthropic": null,
      "openai": null,
      "gemini": null,
      "deepseek": null,
      "minimax": null
    },
    "claude_model": "claude-haiku-4-5-20251001"
  },
  "ttl_defaults": {
    "verified-api-endpoint": 30,
    "verified-static-behavior": 365,
    "verified-workflow": 60,
    "gotcha": 90,
    "failure-mode": 180,
    "hypothesis": 14
  },
  "consolidation": {
    "min_consensus_count": 2
  },
  "domains": {}
}
```

Note: `dashboard.host: "127.0.0.1"` is present in this live file but absent from `ConfigSchema` (which only declares `port`). Zod strips it silently on `saveConfig` round-trip. Pre-existing; out of scope.

### `config.example.json` (currently)

```json
{
  "$schema": "https://quorum.local/config.schema.json",
  "version": "0.1.0",
  "storage_dir": "~/.claude/mcp-servers/quorum/data",
  "dashboard": { "port": 4729 },
  "similarity": {
    "engine": "hash-only",
    ...
  }
}
```

### `src/similarity/engine.ts` (full file, line 1-47)

```ts
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

export async function getEngine(name: string, config: Config): Promise<SimilarityEngine> {
  switch (name as EngineName) {
    case "hash-only": {
      const { HashOnlyEngine } = await import("./hash-only.js");
      return new HashOnlyEngine();
    }
    case "claude-haiku":
    case "claude-sonnet": {
      const { ClaudeEngine } = await import("./claude.js");
      return new ClaudeEngine(config, config.similarity.claude_model);
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
```

This is where `ENGINE_STATUS` must be added (Phase 1). Nothing here is removed.

### `src/similarity/claude.ts:34-83` — `cluster()` response parse

```ts
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
```

Expected response shape: `"[[0,1],[2]]"` — number-of-arrays-of-zero-based-indices. Every input index 0..N-1 must appear exactly once. SYSTEM_PROMPT enforces this in the model's instructions. Empty-text response or non-array → throws.

`ClaudeEngine.available()` (line 26-32): returns `true` if `apiKey` is a non-empty string. Does NOT ping the API. The new startup validator must call `available()` only — calling `cluster([])` would still return `[]` without an API call.

### `src/index.ts` (full file, lines 1-54)

```ts
console.log = console.error.bind(console);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { name as shoutName, schema as shoutSchema, handler as shoutHandler } from "./tools/shout.ts";
// ...
const server = new McpServer(
  { name: "quorum", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.tool(shoutName, shoutSchema.shape, async (input) => {
  const text = await shoutHandler(input as Parameters<typeof shoutHandler>[0]);
  return { content: [{ type: "text", text }] };
});
// ... 5 more tools ...

const transport = new StdioServerTransport();

process.stderr.write(JSON.stringify({ level: "info", msg: "Quorum MCP server starting" }) + "\n");

await server.connect(transport);
```

No startup validation today. New validator must run **before** `await server.connect(transport)` and **after** logging the startup line so failure messages still reach stderr in expected order. On failure: write error JSON to stderr and call `process.exit(1)`. NEVER write to stdout (reserved for JSON-RPC frames).

### `bin/quorum.ts:93-136` — `runConsolidate`

```ts
async function runConsolidate(domain?: string): Promise<void> {
  let domains: string[];
  if (domain) {
    domains = [domain];
  } else {
    const config = await loadConfig();
    // ... list domains from consolidated dir
  }
  // ... call consolidateHandler({ domain: d }) per domain
}
```

`consolidateHandler` already loads config and resolves the engine via `getEngine(engineName, config)` at `src/tools/consolidate.ts:48`. If the engine's `cluster()` throws (e.g. Anthropic returns 401), the handler catches and returns `{ error: ... }` (line 117-119). The CLI prints that error. So consolidator already fails noisily on bad keys at call time — but only **once observations exist**. The new startup-style validator should run at the top of `runConsolidate` before iterating, so an empty-ledger run still detects misconfiguration loudly.

### `bin/quorum.ts:26-50` — `runInit`

```ts
async function runInit(): Promise<void> {
  const configPath = DEFAULT_CONFIG_PATH;
  const configFile = Bun.file(configPath);
  const configExists = await configFile.exists();

  const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
  await ensureStorageDirs(storageDir);

  if (configExists) {
    console.log("Config already exists at " + configPath + " — skipping write.");
  } else {
    await saveConfig(DEFAULT_CONFIG, configPath);
    console.log("Config written to " + configPath);
  }

  console.log("Storage dirs ensured at " + storageDir);

  const answer = await promptLine("Add quorum to ~/.claude/settings.json? [y/N] ");

  if (answer.toLowerCase() === "y") {
    await registerMcpServer();
  } else {
    printManualSnippet();
  }
}
```

The new `ANTHROPIC_API_KEY` prompt should be inserted **after** the storage-dirs message and **before** the settings.json prompt. Skip cleanly if:
- `DEFAULT_CONFIG.similarity.engine` is not a claude-* engine (defensive — should be in the future)
- `process.env.ANTHROPIC_API_KEY` is already set (use env, don't write to config)
- `configExists && loadedConfig.similarity.api_keys.anthropic` is already non-null
- User enters empty string (explicit skip)

If user provides a key, write it into `config.json` via `saveConfig` (load first to preserve other fields, mutate `similarity.api_keys.anthropic`, save).

### `src/dashboard/app.js:18-35` — current dropdown data

```js
engineNames: [
  'hash-only',
  'claude-haiku',
  'claude-sonnet',
  'openai-embed',
  'gemini',
  'deepseek',
  'minimax',
  'local-minilm',
],
needsApiKey: [
  'claude-haiku',
  'claude-sonnet',
  'openai-embed',
  'gemini',
  'deepseek',
  'minimax',
],
```

This is duplicated state (also in `src/similarity/engine.ts:6-15`). Phase 2 should switch dashboard to fetch engine metadata from the server via a new `GET /api/engines` route so the hardcoded map lives in exactly one place (`src/similarity/engine.ts`), preserving the "single source of truth" principle.

### `src/dashboard/index.html:196-203` — current dropdown rendering

```html
<div class="settings-group">
  <label>Similarity Engine</label>
  <select class="engine-select" x-model="config.similarity.engine">
    <template x-for="name in engineNames" :key="name">
      <option :value="name" x-text="name"></option>
    </template>
  </select>
</div>
```

`<option x-text="name">` shows just the engine name. New rendering: `<option x-text="name + ' — ' + (engineStatus[name] || 'unknown')">` (or similar; engine_status comes from server).

### `src/tools/consolidate.ts:14-19` — `consolidate` MCP tool schema

```ts
export const schema = z.object({
  domain: z.string().describe("Knowledge domain to consolidate"),
  engine: z.string().optional().describe("Override similarity engine (e.g. hash-only, claude-haiku). Defaults to config engine."),
});
```

The `engine` override field lets battle tests force `engine: "hash-only"` or `engine: "claude-haiku"` per call, isolating each test from config drift.

### `src/lifecycle/promote.ts:1-43` — verbatim consensus merge

```ts
export function promote(
  cluster: Observation[],
  existing: ConsolidatedEntry[],
  now: number
): { status: "hypothesis" | "verified"; confirmed_by: string[]; ttl_expires_at: number } {
  const clusterAgents = cluster.map((o) => o.agent_id);
  const clusterObsIds = new Set(cluster.map((o) => o.obs_id));

  const primaryObsId = cluster[0]?.obs_id;
  const existingEntry = existing.find(
    (e) =>
      clusterObsIds.has(e.obs_id) ||
      e.obs_id === primaryObsId ||
      e.confirmed_by.some((agent) => clusterAgents.includes(agent))
  );

  const priorAgents = existingEntry?.confirmed_by ?? [];
  const mergedAgents = [...new Set([...priorAgents, ...clusterAgents])];

  const status: "hypothesis" | "verified" = mergedAgents.length >= 2 ? "verified" : "hypothesis";
  // TTL always computed from current ts — handles both fresh entries and re-shouts of
  // expired verified entries (spec: "re-shout resets TTL from current Date.now()").
  const type = cluster[0]?.type ?? "hypothesis";
  const ttl_expires_at = computeTtlExpiry(type, now);

  return { status, confirmed_by: mergedAgents, ttl_expires_at };
}
```

**Critical for battle test:** the `existingEntry` lookup uses three signals (obs_id overlap, primary obs_id match, agent overlap). The **agent-overlap branch** is the cross-phase consensus bridge: if run 1's entry was written by agent `"main"`, and run 2's cluster contains agent `"sub-1"` with a different obs_id, the `existing.find` will only match if the consolidate.ts caller passes the *same primaryObsId* (current behavior — `consolidate.ts:54-77` keys entries by `primaryObs.obs_id`). Two different agents shouting the *same claim text* produce *different obs_ids*, so the lookup falls back to the agent-overlap clause only when the primaryObsId matches. This is fragile — see "Risks & unknowns".

### `src/tools/recall.ts:14-17` — version header format

```ts
function buildVersionHeader(domain: string, hash: string): string {
  const ts = new Date().toISOString();
  return `<!-- quorum | domain=${domain} | content_hash=${hash} | recall_ts=${ts} -->`;
}
```

Line 1 of every `learn_recall` response. Battle test must regex-assert `^<!-- quorum \| domain=[^|]+ \| content_hash=[a-f0-9]* \| recall_ts=\d{4}-\d{2}-\d{2}T.*-->$`.

### `src/storage/ledger.ts:5-10` — append behavior

```ts
export async function appendObservation(domain: string, obs: Observation): Promise<void> {
  const storageDir = await resolveStorageDir();
  const filePath = ledgerPath(storageDir, domain);
  const line = JSON.stringify(obs) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}
```

Uses `fs.appendFile` (POSIX `O_APPEND` — atomic per-syscall up to `PIPE_BUF` ≈ 4 KB on macOS). Battle test must verify every observation line in the swarm output parses as valid JSON.

### Existing MCP stdio smoke pattern — `tests/uat/mcp-server/stdio/01-tools-list.test.ts:52-68`

```ts
const INIT_MSG = JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke-test", version: "1" } },
}) + "\n";

const TOOLS_LIST_MSG = JSON.stringify({
  jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
}) + "\n";
```

Phase 4's MCP smoke can reuse `sendAndCollect` pattern via direct handler imports (faster — see Phase 4 spec).

### Existing engine-registry test — `tests/uat/similarity/clustering/03-engine-registry.ts:34`

```ts
assert("ENGINE_NAMES has exactly 8 entries", ENGINE_NAMES.length === 8,
  `got ${ENGINE_NAMES.length}: ${ENGINE_NAMES.join(", ")}`);
```

This is the **safety net** that enforces "no engine deletion." If Phase 1 accidentally drops an entry, this test fails immediately.

### User's hard constraints (verbatim)

> "DO NOT delete src/similarity/{hash-only,openai,gemini,stubs}.ts. The pluggable surface is intentional architecture."
> "DO NOT touch ~/.claude/settings.json manually — quorum init handles it."
> "DO NOT delete or rename ~/.claude/mcp-servers/quorum/data/. Use sacrificial domain names for tests."
> "If MCP registration smoke fails after Claude Code restart, STOP the orchestration. Investigate before any swarm dispatch."
> "Subagent dispatch for the swarm: real Task tool spawning, not simulated loops — reproduce genuine Claude Code parallel invocation."

### Engine status map (per user brief, verbatim)

```
claude-haiku        → "battle-tested"   (after this orchestration)
claude-sonnet       → "untested"        (coded but no real API call yet)
hash-only           → "battle-tested"   (already verified in v0.1)
openai-embed        → "untested"
gemini              → "untested"
deepseek/minimax/local-minilm → "stub — contribute"
```

Per orchestrator clarification: "the executor for the refactor phase should write it as `battle-tested` directly, since that's the point of this orchestration — graduating it." So Phase 1 writes `claude-haiku: battle-tested` from the start. If Phase 3-5 fail and reveal that claude-haiku is NOT actually working, the executor of the failing phase must **revert claude-haiku to `untested`** and surface that the default change should be rolled back.

## Code intelligence

GitNexus does NOT have `quorum` indexed (verified via `mcp__gitnexus__list_repos` — repo absent from the 31 indexed). Falling back to ripgrep/grep per `references/gitnexus-integration.md` rule for non-indexed repos.

### File structure (relevant subset)

```
~/.claude/mcp-servers/quorum/
├── bin/quorum.ts              # CLI (init, consolidate, status, dashboard)
├── config.json                # LIVE config (must update)
├── config.example.json        # Example config (must update for symmetry)
├── README.md                  # User docs
├── src/
│   ├── config.ts              # DEFAULT_CONFIG, ConfigSchema, loadConfig, saveConfig
│   ├── index.ts               # MCP stdio entry, 6 server.tool() calls
│   ├── server.ts              # HTTP dashboard backend (Hono)
│   ├── paths.ts               # storage path helpers
│   ├── types.ts               # SimilarityEngine, Observation, ConsolidatedEntry
│   ├── similarity/
│   │   ├── engine.ts          # ENGINE_NAMES (8), getEngine() factory
│   │   ├── hash-only.ts       # HashOnlyEngine (Jaccard 0.3)
│   │   ├── claude.ts          # ClaudeEngine (Anthropic SDK)
│   │   ├── openai.ts          # OpenAIEmbedEngine (cosine 0.85)
│   │   ├── gemini.ts          # GeminiEngine
│   │   └── stubs.ts           # deepseek/minimax/local-minilm stubs
│   ├── lifecycle/
│   │   ├── promote.ts         # promote() — consensus merge across runs
│   │   └── ttl.ts             # computeTtlExpiry, isExpired
│   ├── tools/
│   │   ├── shout.ts           # learn_shout
│   │   ├── recall.ts          # learn_recall (version header)
│   │   ├── consolidate.ts     # learn_consolidate (orchestrates pipeline)
│   │   ├── contradict.ts      # learn_contradict (quarantines)
│   │   ├── verify.ts          # learn_verify (refreshes TTL, archive-aware)
│   │   └── status.ts          # learn_status (per-domain counts)
│   ├── storage/
│   │   ├── ledger.ts          # appendObservation, readLedgerSince (JSONL)
│   │   ├── consolidated.ts    # readConsolidated, writeConsolidated (atomic)
│   │   ├── quarantine.ts
│   │   ├── archive.ts         # roll() — moves old ledger entries to archive
│   │   └── state.ts
│   └── dashboard/
│       ├── index.html         # Alpine.js single-page UI
│       ├── app.js             # Component state (engineNames, needsApiKey)
│       └── style.css
└── tests/
    ├── uat/                   # 185 existing tests (DO NOT BREAK)
    │   ├── foundation/init-cli/
    │   ├── similarity/clustering/  # 03-engine-registry.ts enforces 8 names
    │   ├── http-api/rest-endpoints/  # config-get, config-post hurl
    │   ├── mcp-server/stdio/  # 01-tools-list.test.ts (smoke pattern reusable)
    │   ├── tools/learn-star-handlers/  # 7 tests for the 6 tools
    │   └── ...
    └── battle-test/           # NEW (Phase 3, 4, 5)
```

### Ripgrep impact — engine name references

`grep -rn 'engine.*hash-only\|engineNames\|ENGINE_NAMES'` (full output captured during research) shows engine names referenced in:

| File | Lines | Type | Action |
|---|---|---|---|
| `src/config.ts` | 66 | DEFAULT (string lit) | **Change** to `claude-haiku` |
| `src/dashboard/app.js` | 18-27, 28-35, 40-46 | Hardcoded arrays + map | **Replace** with server-fetched list (Phase 2) |
| `src/dashboard/index.html` | 199 | x-for | **Update** template to render status (Phase 2) |
| `src/similarity/engine.ts` | 6-15 | ENGINE_NAMES (canonical) | **Add** `ENGINE_STATUS` export (Phase 1) |
| `src/tools/consolidate.ts` | 16, 25, 48 | engine param / loadConfig | No change |
| `config.json` | 10 | Live file | **Change** to `claude-haiku` |
| `config.example.json` | 9 | Example doc | **Change** to `claude-haiku` |
| `tests/uat/similarity/clustering/03-engine-registry.ts` | 24-32, 34, 73 | Engine name assertions | **No change** — still asserts 8 names exist; passes |
| `tests/uat/foundation/init-cli/03-config-zod-rejects-negatives.ts` | 32 | Test fixture (`engine: "hash-only"`) | No change — fixture is local |
| `tests/uat/tools/learn-star-handlers/07-archive-aware-lookup.test.ts` | 11 | Comment only | No change |
| `tests/uat/http-api/rest-endpoints/04-config-post-invalid.hurl` | 15 | POST fixture with `engine: "hash-only"` | No change — testing TTL validation, not engine value |
| `tests/uat/http-api/rest-endpoints/03-config-get.hurl` | 11 | `$.similarity.engine isString` | No change — asserts type only |

### Impact summary (ripgrep-based, no gitnexus)

| Symbol/Target | Direction | Callers (d=1) | Risk Level |
|---|---|---|---|
| `DEFAULT_CONFIG.similarity.engine` (string literal value) | upstream | `loadConfig` (config.ts:90, returns DEFAULT_CONFIG on missing file), test fixtures using DEFAULT_CONFIG | **LOW** — value change only; no signature break. Existing tests pass `hash-only` explicitly, so DEFAULT_CONFIG value change doesn't break their flow. |
| `ENGINE_NAMES` | upstream | `getEngine` (engine.ts:19), `tests/uat/similarity/clustering/03-engine-registry.ts` | **LOW** — adding `ENGINE_STATUS` next to it; no signature change. |
| `getEngine` | upstream | `src/tools/consolidate.ts:48` (only caller in src/) | **LOW** — signature unchanged. |
| `bin/quorum.ts` `runInit` | upstream | CLI subcommand `init` only | **LOW** — insertion point well-bounded. |
| `src/index.ts` startup | upstream | Bun runtime entry | **MED** — adding `process.exit(1)` path. Must NOT write to stdout. Existing `tests/uat/mcp-server/stdio/01-tools-list.test.ts:101-109` asserts startup log goes to stderr, not stdout — new validator output must also go to stderr. |
| `src/dashboard/app.js` `engineNames` / `needsApiKey` | upstream | `index.html` x-for / x-show | **MED** — must keep field references valid during transition. |
| `src/server.ts` (adding `/api/engines` route) | upstream | New route, no existing callers | **LOW** — additive. |
| `src/lifecycle/promote.ts` `promote()` | upstream | `src/tools/consolidate.ts:54` (only caller) | **N/A — not modified.** Battle test exercises it but does not change it. |
| `src/tools/recall.ts` `buildVersionHeader` | upstream | `recall.ts` internal | **N/A — not modified.** Battle test asserts output. |

No HIGH/CRITICAL findings. The MED items are addressable in-plan (Phase 1 must use `process.stderr.write`; Phase 2 must keep field names usable through transition).

## Risks & unknowns

### Risk: cross-phase consensus merge has a narrow lookup surface

`promote.ts:13-19` only finds an existing entry if at least one of these holds:
1. The cluster contains an obs_id that matches an existing entry's `obs_id` (same observation re-clustered — rare across runs).
2. The cluster's *primary* (index 0) obs_id matches an existing entry's `obs_id` (only possible if the primary obs is itself an existing entry's obs).
3. The existing entry's `confirmed_by` contains an agent that is also in the new cluster (agent overlap).

Two different agents shouting **the same claim text** but with **different obs_ids** trigger #3 *only* if they share an `agent_id`. Different agents shouting the same claim do NOT share an `agent_id`, so #3 is bypassed too. The clusters land as two separate entries until clustering merges them by claim similarity in a single run.

**Implication for battle test:** Phase 4's "consensus" test must run consolidate **TWICE** — first with agent A's shout (creates entry with status=hypothesis, confirmed_by=[A]), then second run after agent B shouts the same claim. The hash-only engine will cluster A and B's claims in run 2 (same claim text → same normalized hash → grouped), and the promote lookup will match via #1 if B's obs_id is somehow chosen as primary, else create a new entry. **The test must accept either outcome** (one verified entry with 2 agents, OR two hypothesis entries that get merged on a third run) and document which one the current code produces. If the result is "two hypothesis entries with no merge," that's a bug in `promote.ts` for the executor to flag — but **fixing promote.ts is out of scope for this orchestration** unless the user approves an in-loop fix.

### Risk: `Anthropic` SDK rate limit and cost

- Haiku free tier is 50 req/min. `claude.ts:45` enforces 200ms sleep, so a single `cluster()` call is fine but a 20-subagent swarm each triggering consolidate could exceed.
- Cost per `cluster()` call ≈ $0.0001-0.001 depending on claim count. Battle test of 20 agents × 5 claims each × 1 consolidate run ≈ <$0.01. Negligible but report total in Phase 3.

### Risk: Concurrent `fs.appendFile` to JSONL ledger

- POSIX `O_APPEND` is atomic up to `PIPE_BUF` (4 KB on macOS). Each `Observation` JSON line must be < 2 KB to leave margin.
- Phase 5 swarm test must verify every line in `ledger/<sacrificial-domain>.jsonl` parses as JSON after the swarm completes. If a line is corrupted (line-interleaved bytes), the test fails and the executor must scope down the test parameters (fewer agents, shorter claims).

### Risk: ANTHROPIC_API_KEY presence

- Verified `2026-05-25`: `ANTHROPIC_API_KEY` is **NOT SET** in the current shell environment.
- Phase 1's startup validator must check both `config.json:similarity.api_keys.anthropic` AND `process.env.ANTHROPIC_API_KEY`. If both are null/empty and the active engine is claude-*, fail loud.
- Battle test scripts (Phase 3+) must check for the key at script start and abort with a user-friendly message if missing.

### Risk: Live `config.json` update vs DEFAULT_CONFIG change

If we update live `config.json` to `engine: "claude-haiku"` but the user has no API key, the MCP server will refuse to start until they paste a key. Per the brief this is intentional ("No silent fallback to hash-only — that hides config bugs"), but it WILL break the user's running Claude Code session at next MCP restart until they paste a key.

**Mitigation:** Phase 1's executor must check whether `ANTHROPIC_API_KEY` env or live `config.json` already has a key BEFORE updating the live `config.json` engine field. If no key exists, the executor must:
1. Run `quorum init` programmatically (or invoke the new prompt) to capture a key,
2. OR leave the live `config.json` engine as `hash-only` and only change `DEFAULT_CONFIG`, then surface to the user via `AskUserQuestion` what they want.

This is a BLOCKING open question — see below.

### Unknown: Whether Anthropic SDK version 0.98.0 supports `cache_control: { type: "ephemeral" }`

The pinned SDK is `@anthropic-ai/sdk: ^0.98.0` (package.json). Cache control on system prompts was added in SDK 0.20+ with prompt caching GA. Phase 3 must verify the API returns `cache_creation_input_tokens` / `cache_read_input_tokens` in the response — if absent, prompt caching is silently disabled (still works, just costs more). Capture the raw response.usage object in Phase 3 evidence.

### Unknown: Dashboard polling endpoint under load

Spec mentions "dashboard polling /api/domains every 2s while swarm runs." Today the dashboard does NOT poll automatically — `loadDomains()` only fires on init or after `backToOverview()` (`app.js:188`). The "polling under load" battle test only meaningfully exercises the server side; Phase 5 should invoke `curl` in a loop, not depend on the browser dashboard polling.

### Out of scope (pre-existing observations, do not fix in this orchestration)

- Dashboard tab tables (`src/dashboard/index.html:99-119, 137-149, 159-178`) reference fields `row.key`, `row.value`, `row.sources`, `row.confidence`, `pair.a.key`, `pair.a.value` — but `Observation` uses `claim`/`obs_id`/`agent_id` and `ConsolidatedEntry` uses `claim`/`obs_id`/`confirmed_by`. The tables will render `—` or `undefined` for all rows. This is a pre-existing rendering bug. NOT in scope.
- `dashboard.host` field present in live `config.json:7` but missing from `ConfigSchema` → silently stripped on save. NOT in scope.
- `bin/quorum.ts:114` help text says "use learn_observe to add observations" but the tool is `learn_shout`. NOT in scope.

## Open questions

### Resolved before plan

- **All 8 engines remain?** Yes (user clarification). `ENGINE_NAMES.length === 8` invariant preserved.
- **Battle test uses real Task spawning?** Yes (user clarification). Phase 5 dispatches real Sonnet subagents via `Agent({subagent_type: "orchestration-executor"})` with a swarm-shout prompt.
- **Status tag values?** Hardcoded map per brief: `battle-tested` / `untested` / `stub — contribute`. Phase 1 writes `claude-haiku → battle-tested` from the start.
- **Sacrificial domain name?** Use `battle-test-${Date.now()}` (per brief). Each battle test run uses a fresh domain to keep existing learnings untouched.
- **Battle test scripts location?** `tests/battle-test/` (new directory, separate from `tests/uat/`). UAT runs against the deployed server; battle tests are one-off integration scripts.

### [BLOCKING] — must answer before Phase 1 starts

- **Q1: What to do about live `config.json` when no `ANTHROPIC_API_KEY` exists?** Three options:
  - **A. Update live `config.json` to `claude-haiku` anyway** — MCP server will fail loud on next restart; user must immediately paste a key via dashboard or rerun `quorum init`. Honest and surfaces the missing config — the user explicitly said "no silent fallback".
  - **B. Update only `DEFAULT_CONFIG`; leave live `config.json` as `hash-only` until user supplies a key** — preserves user's running session; new installs get claude-haiku; existing installs keep working.
  - **C. Run `quorum init` prompt during Phase 1 execution to capture the user's key right now, then update live config to `claude-haiku`** — most automated but mid-orchestration user prompt is intrusive.

  Default proposal: **A** — matches the user's explicit "fail loud" directive and is the cleanest demonstration that the startup validator works. The user can paste a key in seconds via the dashboard once they see the loud failure. (Phase 1 executor must surface the failure clearly in the progress log so it's not mistaken for a real bug.)

- **Q2: Where do battle test logs go?** Proposal: `tests/battle-test/runs/<ISO-timestamp>/` — JSONL evidence files for replay. Plan adopts this unless overridden.

- **Q3: Does the consolidator's CLI (`bin/quorum.ts consolidate`) need the SAME loud startup validator as `src/index.ts`?** Proposal: **Yes**. Per the brief, "MCP server + consolidator MUST fail loud at startup if the active engine needs a key and none is configured." Plan adopts this.

### Non-blocking, may answer during/after plan

- **Q4: Should `quorum init` also offer to prompt for OpenAI/Gemini keys?** Out of scope for this orchestration (those engines aren't being graduated). Mention in README only.
- **Q5: After this orchestration, should `claude-sonnet` automatically inherit `battle-tested` since it uses the same `ClaudeEngine` class?** Per user brief: NO. Sonnet stays `untested` until a future orchestration explicitly exercises it (e.g., test the model field is honored, response shape, cost calc). The status tag tracks "this engine value has been battle-tested," not "the underlying class has been tested with one model."

## Reference artifacts

- Existing master plan for v0.1: `~/.claude/mcp-servers/quorum/docs/plan/2026-05-25-quorum-mcp/plan.md`
- Existing research doc for v0.1: `~/.claude/mcp-servers/quorum/docs/plan/2026-05-25-quorum-mcp/research.md`
- MCP smoke pattern (reusable): `~/.claude/mcp-servers/quorum/tests/uat/mcp-server/stdio/01-tools-list.test.ts`
- Engine-name invariant test: `~/.claude/mcp-servers/quorum/tests/uat/similarity/clustering/03-engine-registry.ts`
- Settings file (already has quorum registered): `~/.claude/settings.json` → `mcpServers.quorum`
- Anthropic SDK docs (prompt caching): https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
