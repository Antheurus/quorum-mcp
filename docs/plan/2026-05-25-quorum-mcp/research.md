---
descriptor: 2026-05-25-quorum-mcp
created: 2026-05-25
---

# Research — Quorum MCP

## Problem statement

User runs **6–12 main agents + up to 40 subagents in parallel**. Existing memory MCPs (context-mode, claude-mem) break in this swarm pattern because:

1. **Write contention** — multiple agents writing same logical observation creates duplicates / race conditions
2. **No quality gate** — every agent assertion treated equally; hypotheses pollute verified facts
3. **Context poisoning** — once a wrong fact enters memory, KV cache makes it sticky (Anthropic has zero incentive to evict cached prefixes; cache hit/miss bills same)
4. **No contradiction handling** — corrections silently overwrite without provenance

## Architectural decisions (user-confirmed)

| Decision | Value | Rationale |
|---|---|---|
| Name | `quorum` | Emphasizes consensus mechanic — claim becomes verified after N agents confirm |
| Install location | `~/.claude/mcp-servers/quorum/` | Global, available to all projects |
| Runtime | Bun + TypeScript, no build step | Matches user's existing stack |
| Storage | File-based, append-only JSONL ledger | Trivially parallel writes, no DB needed |
| Similarity engine | Pluggable via dropdown | User picks: hash-only / claude-haiku / claude-sonnet / openai-embed / gemini / deepseek / minimax / local-minilm |
| Frontend | HTTP dashboard like claude-mem | Centralized config + browse + manual consolidate |
| Consolidator | Deterministic (90%) + similarity engine (10%) | Cost: ~$0–$0.50/month at user's scale |
| Configuration | Single JSON file, centralized | All settings + API keys in one place |

## Constraints

- **No Opus for similarity** — too expensive. Haiku/Sonnet only for Claude option.
- **External providers (DeepSeek, Gemini, Minimax) acceptable** — user is OK with non-Anthropic.
- **Consolidator runs off agent hot path** — invoked by cron or `loop` skill, not blocking.
- **Append-only ledger is non-negotiable** — writes must be lock-free under 40-agent parallelism.

## Anti-poisoning primitives (5 layers, all required)

1. **TTL on every claim** — claims expire if not re-verified (default per type: 14d hypothesis, 30d verified-api, 1y verified-static-behavior, etc).
2. **Evidence pointer required** — every recall output includes provenance (`agent_id`, `evidence` file/url, `confirmed_by[]`). No anonymous claims.
3. **Contradiction → quarantine** — `learn_contradict(old_obs_id)` moves both old+new to quarantine bucket. Neither served as "verified" until manually or automatically resolved.
4. **Cache-bust version header** — every `learn_recall` output begins with `<!-- quorum | domain=X | content_hash=Y -->`. Hash changes when consolidated/ updates → KV cache prefix breaks → forced fresh read.
5. **Periodic re-verification dispatch** — scheduled task spot-checks claims nearing TTL expiry, especially the frequently-recalled ones.

## Data flow

```
Subagent finishes task → learn_shout (append-only, no LLM)
                              ↓
                  ledger/{domain}.jsonl  ← 40 agent paralel aman
                              ↓
                  Consolidator (per-domain lock, cron-triggered)
                  - Hash dedup (deterministic)
                  - Similarity cluster (pluggable engine)
                  - Promote: hypothesis → verified when ≥2 independent agents
                  - Demote: contradicted → quarantine
                  - Template-write to consolidated/{domain}.md
                              ↓
                  consolidated/{domain}.md  + content_hash in state.json
                              ↓
Subagent starts task → learn_recall (filtered by hint, version-headered)
```

## MCP tool surface

| Tool | Hot path? | LLM call? | Returns |
|---|---|---|---|
| `learn_shout` | yes (subagent) | no | `{obs_id}` |
| `learn_recall` | yes (subagent) | no | `{markdown, freshness}` |
| `learn_contradict` | yes | no | `{quarantine_id}` |
| `learn_verify` | yes | no | `{new_ttl_expiry}` |
| `learn_consolidate` | no (cron) | yes (similarity engine only) | `{merged, promoted, archived, quarantined}` |
| `learn_status` | no | no | `{domains: [...]}` |

## TTL defaults (per type)

| Type | TTL | Rationale |
|---|---|---|
| `verified-api-endpoint` | 30 days | APIs change |
| `verified-static-behavior` | 365 days | JS event loop, browser API — stable |
| `verified-workflow` | 60 days | UI workflows can change with redesigns |
| `gotcha` | 90 days | Workarounds may become unnecessary |
| `failure-mode` | 180 days | AI failure patterns long-lived |
| `hypothesis` | 14 days | Must be confirmed or it decays |

All configurable via `config.json` per-domain.

## Promotion rules

- `hypothesis` → `verified` when ≥ 2 independent `agent_id` shout same/similar claim within TTL window
- `verified` → `stale` when TTL expires without re-verification
- `verified` → `contested` when `learn_contradict` called referencing this obs_id
- `stale` → `verified` (TTL reset) when `learn_verify` called referencing this obs_id

## Similarity engine interface

```typescript
interface SimilarityEngine {
  name: string;
  available(): Promise<boolean>;          // API key configured, model reachable
  cluster(claims: string[]): Promise<number[][]>;  // returns indices of similar claim groups
  estimateCost(claimCount: number): string;        // human-readable cost preview
}
```

Engines:
- `hash-only` — exact hash + normalized substring (Jaccard on word sets). No API needed. Default.
- `claude-haiku` — Anthropic API. Cheap Claude. Asks "are these claims about the same thing?" in batches.
- `claude-sonnet` — Same but Sonnet. For higher quality clustering.
- `openai-embed` — text-embedding-3-small. Cosine similarity > 0.85.
- `gemini` — gemini-1.5-flash or embedding-001.
- `deepseek` — deepseek-chat (cheap).
- `minimax` — minimax-text-01.
- `local-minilm` — `@xenova/transformers` all-MiniLM-L6-v2. Zero ongoing cost. 22MB model.

Initial implementations: `hash-only` (full), `claude-haiku` (full), `openai-embed` (full), `gemini` (full). Others as stubs that error with "not implemented in v0.1, contribute via {github_url}" — registry still includes them in dropdown so user sees roadmap.

## Frontend (dashboard) requirements

Routes:
- `/` — Overview: per-domain stats (ledger count, consolidated count, quarantine count, last consolidation time)
- `/domain/:name` — Browse: tabs for Ledger (raw entries) / Consolidated (rendered MD) / Quarantine (contested pairs)
- `/settings` — Engine dropdown, API keys (masked), TTL overrides per type per domain, consolidation schedule
- `/consolidate/:domain` — Manual trigger button + progress display

Tech: vanilla JS + Alpine.js (from CDN, no bundler). HTML files served by Hono.

## Config file layout

```json
{
  "$schema": "https://quorum.local/config.schema.json",
  "version": "0.1.0",
  "storage_dir": "~/.claude/mcp-servers/quorum/data",
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

`domains.{name}.ttl_overrides` allows per-domain customization later.

## Known unknowns (resolved during build)

- Exact MCP SDK version semantics (verified 1.0.4+ supports tool registry pattern used here)
- Hono on Bun runtime (verified — `@hono/node-server` not needed; Hono has native Bun support)
- Whether to bundle Alpine.js or load from CDN (decision: CDN for simplicity, can self-host later)

## Out of scope for v0.1

- Multi-user / multi-tenant (single-user only)
- Auth for dashboard (trusts localhost binding)
- Vector DB backend (file-based only; vector DB possible later for >50K entries)
- Slack/webhook notifications on contradictions
- Diff visualization between consolidated versions
- Real-time WebSocket updates to dashboard (page-refresh model OK for now)
